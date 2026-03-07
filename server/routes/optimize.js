/**
 * 优化求解 API
 * POST /api/optimize - 运行 MILP 优化求解
 * POST /api/optimize/single - 单策略求解
 */
import { Router } from 'express'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getDb } from '../db/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PYTHON_SCRIPT = join(__dirname, '..', 'python', 'optimizer.py')

const router = Router()

/**
 * 从 realtime_data 表读取今天的实时数据，转为 optimizer overrides。
 * 用户显式传的参数 > 实时数据 > 默认硬编码值。
 */
function getRealtimeOverrides() {
  try {
    const db = getDb()
    const today = new Date().toISOString().slice(0, 10)
    const rows = db.prepare(
      'SELECT hour, price_grid, ef_grid, shortwave_radiation FROM realtime_data WHERE data_date = ? ORDER BY hour'
    ).all(today)

    if (rows.length < 24) return null

    const prices = rows.map(r => r.price_grid)
    const efGrid = rows.map(r => r.ef_grid)
    const radiation = rows.map(r => r.shortwave_radiation)
    const gMax = Math.max(...radiation, 1)
    const gProfile = radiation.map(v => v / gMax)
    const gScale = gMax / 1000 * 1.5

    return { price_grid: prices, EF_grid: efGrid, G_profile: gProfile, G_scale: gScale }
  } catch (e) {
    console.warn('[optimize] 读取实时数据失败，使用默认值:', e.message)
    return null
  }
}

/**
 * 合并实时数据到 params，用户显式传的参数优先级更高。
 */
function mergeRealtimeParams(userParams) {
  const realtime = getRealtimeOverrides()
  if (!realtime) return userParams

  const merged = { ...userParams }
  for (const key of ['price_grid', 'EF_grid', 'G_profile', 'G_scale']) {
    if (merged[key] == null && realtime[key] != null) {
      merged[key] = realtime[key]
    }
  }
  return merged
}

function runPython(input) {
  return new Promise((resolve, reject) => {
    const py = spawn('python', [PYTHON_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
    })

    let stdout = ''
    let stderr = ''

    py.stdout.on('data', (d) => { stdout += d.toString() })
    py.stderr.on('data', (d) => { stderr += d.toString() })

    py.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python exited ${code}: ${stderr.slice(0, 500)}`))
      } else {
        try {
          resolve(JSON.parse(stdout))
        } catch (e) {
          reject(new Error(`Invalid JSON: ${stdout.slice(0, 200)}`))
        }
      }
    })

    py.on('error', (err) => reject(err))
    py.stdin.write(JSON.stringify(input))
    py.stdin.end()
  })
}

/**
 * @route POST /api/optimize
 * @body { params?: object, extra_constraints?: array, save?: boolean, name?: string }
 */
router.post('/', async (req, res) => {
  try {
    const { params = {}, extra_constraints = [], save = false, name } = req.body
    const mergedParams = mergeRealtimeParams(params)
    const result = await runPython({
      mode: 'all',
      params: mergedParams,
      extra_constraints,
    })

    if (save) {
      const db = getDb()
      const dsName = name || `优化结果 ${new Date().toLocaleString('zh-CN')}`
      const stmt = db.prepare('INSERT INTO datasets (name, data) VALUES (?, ?)')
      const info = stmt.run(dsName, JSON.stringify(result))
      result._datasetId = info.lastInsertRowid
    }

    res.json(result)
  } catch (err) {
    console.error('[optimize]', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * @route POST /api/optimize/single
 * @body { strategy: string, params?: object, extra_constraints?: array }
 */
router.post('/single', async (req, res) => {
  try {
    const { strategy = 'cicom', params = {}, extra_constraints = [] } = req.body
    const mergedParams = mergeRealtimeParams(params)
    const result = await runPython({
      mode: 'single',
      strategy,
      params: mergedParams,
      extra_constraints,
    })
    res.json(result)
  } catch (err) {
    console.error('[optimize/single]', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
