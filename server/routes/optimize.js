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

function runPython(input) {
  return new Promise((resolve, reject) => {
    /** Linux 常用 python3，Windows 常用 python */
    const pyCmd = process.platform === 'win32' ? 'python' : 'python3'
    const py = spawn(pyCmd, [PYTHON_SCRIPT], {
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
    const result = await runPython({
      mode: 'all',
      params,
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
    const result = await runPython({
      mode: 'single',
      strategy,
      params,
      extra_constraints,
    })
    res.json(result)
  } catch (err) {
    console.error('[optimize/single]', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
