import { Router } from 'express'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getDb } from '../db/index.js'
import { getBeijingDate, formatBeijingDateTime } from '../lib/time.js'
import { pushServerLog } from '../ws.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PYTHON_SCRIPT = join(__dirname, '..', 'python', 'optimizer.py')

const router = Router()

function getRealtimeOverrides() {
  try {
    const db = getDb()
    const today = getBeijingDate()
    const rows = db.prepare(
      'SELECT hour, price_grid, ef_grid, shortwave_radiation FROM realtime_data WHERE data_date = ? ORDER BY hour'
    ).all(today)

    if (rows.length < 24) return null

    const prices = rows.map((row) => row.price_grid)
    const efGrid = rows.map((row) => row.ef_grid)
    const radiation = rows.map((row) => row.shortwave_radiation)
    const gMax = Math.max(...radiation, 1)
    const gProfile = radiation.map((value) => value / gMax)
    const gScale = gMax / 1000 * 1.5

    return {
      price_grid: prices,
      EF_grid: efGrid,
      G_profile: gProfile,
      G_scale: gScale,
    }
  } catch (error) {
    console.warn('[optimize] failed to load realtime overrides:', error.message)
    pushServerLog({
      level: 'warn',
      status: 'error',
      scope: 'optimize',
      message: '读取北京时间实时参数失败，回退默认优化参数',
      targetDate: getBeijingDate(),
      detail: error.message,
    })
    return null
  }
}

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

function runPython(input, context = {}) {
  const startedAt = Date.now()
  const targetDate = context.targetDate || getBeijingDate()
  const algorithm = input.mode === 'single'
    ? `MILP single-strategy ${input.strategy || 'cicom'}`
    : 'MILP 6-strategy dispatch'

  pushServerLog({
    level: 'info',
    status: 'start',
    scope: 'optimize',
    message: input.mode === 'single' ? '开始单策略优化计算' : '开始多策略优化计算',
    targetDate,
    range: `${targetDate} 00:00-23:00`,
    algorithm,
    detail: `参数更新时间 ${formatBeijingDateTime()}`,
  })

  return new Promise((resolve, reject) => {
    const py = spawn('python', [PYTHON_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
    })

    let stdout = ''
    let stderr = ''

    py.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    py.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    py.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(`Python exited ${code}: ${stderr.slice(0, 500)}`)
        pushServerLog({
          level: 'err',
          status: 'error',
          scope: 'optimize',
          message: '优化器执行失败',
          targetDate,
          range: `${targetDate} 00:00-23:00`,
          algorithm,
          detail: stderr.slice(0, 240) || error.message,
        })
        reject(error)
        return
      }

      try {
        const result = JSON.parse(stdout)
        const durationMs = Date.now() - startedAt
        pushServerLog({
          level: 'ok',
          status: 'done',
          scope: 'optimize',
          message: input.mode === 'single' ? '单策略优化完成' : '多策略优化完成',
          targetDate,
          range: `${targetDate} 00:00-23:00`,
          algorithm,
          detail: `耗时 ${(durationMs / 1000).toFixed(1)}s`,
        })
        resolve(result)
      } catch {
        const error = new Error(`Invalid JSON: ${stdout.slice(0, 200)}`)
        pushServerLog({
          level: 'err',
          status: 'error',
          scope: 'optimize',
          message: '优化器输出解析失败',
          targetDate,
          algorithm,
          detail: error.message,
        })
        reject(error)
      }
    })

    py.on('error', (error) => {
      pushServerLog({
        level: 'err',
        status: 'error',
        scope: 'optimize',
        message: '优化器进程启动失败',
        targetDate,
        algorithm,
        detail: error.message,
      })
      reject(error)
    })

    py.stdin.write(JSON.stringify(input))
    py.stdin.end()
  })
}

router.post('/', async (req, res) => {
  try {
    const { params = {}, extra_constraints = [], save = false, name } = req.body
    const mergedParams = mergeRealtimeParams(params)

    pushServerLog({
      level: 'info',
      status: 'progress',
      scope: 'api',
      message: '收到全策略优化请求',
      targetDate: getBeijingDate(),
      algorithm: 'MILP 6-strategy dispatch',
      detail: `约束 ${extra_constraints.length} 条 | 保存 ${save ? '开启' : '关闭'}`,
    })

    const result = await runPython({
      mode: 'all',
      params: mergedParams,
      extra_constraints,
    }, { targetDate: getBeijingDate() })

    if (save) {
      const db = getDb()
      const dsName = name || `优化结果 ${formatBeijingDateTime()}`
      const stmt = db.prepare('INSERT INTO datasets (name, data) VALUES (?, ?)')
      const info = stmt.run(dsName, JSON.stringify(result))
      result._datasetId = info.lastInsertRowid

      pushServerLog({
        level: 'ok',
        status: 'done',
        scope: 'api',
        message: '优化结果已写入数据集',
        targetDate: getBeijingDate(),
        algorithm: 'MILP 6-strategy dispatch',
        detail: `datasetId ${result._datasetId} | ${dsName}`,
      })
    }

    res.json(result)
  } catch (error) {
    console.error('[optimize]', error)
    pushServerLog({
      level: 'err',
      status: 'error',
      scope: 'api',
      message: '全策略优化接口执行失败',
      targetDate: getBeijingDate(),
      algorithm: 'MILP 6-strategy dispatch',
      detail: error.message,
    })
    res.status(500).json({ error: error.message })
  }
})

router.post('/single', async (req, res) => {
  try {
    const { strategy = 'cicom', params = {}, extra_constraints = [] } = req.body
    const mergedParams = mergeRealtimeParams(params)
    const targetDate = getBeijingDate()

    pushServerLog({
      level: 'info',
      status: 'progress',
      scope: 'api',
      message: '收到单策略优化请求',
      targetDate,
      algorithm: `MILP single-strategy ${strategy}`,
      detail: `约束 ${extra_constraints.length} 条`,
    })

    const result = await runPython({
      mode: 'single',
      strategy,
      params: mergedParams,
      extra_constraints,
    }, { targetDate })

    res.json(result)
  } catch (error) {
    console.error('[optimize/single]', error)
    pushServerLog({
      level: 'err',
      status: 'error',
      scope: 'api',
      message: '单策略优化接口执行失败',
      targetDate: getBeijingDate(),
      algorithm: `MILP single-strategy ${req.body?.strategy || 'cicom'}`,
      detail: error.message,
    })
    res.status(500).json({ error: error.message })
  }
})

export default router
