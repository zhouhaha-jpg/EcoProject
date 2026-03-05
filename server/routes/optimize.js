/**
 * 优化求解 API
 * POST /api/optimize - 运行 MILP 优化求解
 * POST /api/optimize/single - 单策略求解
 */
import { Router } from 'express'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getDb } from '../db/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PYTHON_SCRIPT = join(__dirname, '..', 'python', 'optimizer.py')
/** 部署时 pip 安装到 .python_packages，需设置 PYTHONPATH */
const PYTHON_PACKAGES = join(__dirname, '..', '.python_packages')

const router = Router()

function runPython(input) {
  return new Promise((resolve, reject) => {
    /** Linux 常用 python3，Windows 常用 python */
    const pyCmd = process.platform === 'win32' ? 'python' : 'python3'
    const env = { ...process.env }
    if (existsSync(PYTHON_PACKAGES)) {
      const sep = process.platform === 'win32' ? ';' : ':'
      env.PYTHONPATH = PYTHON_PACKAGES + (env.PYTHONPATH ? `${sep}${env.PYTHONPATH}` : '')
    }
    console.log(`[runPython] 启动 Python: ${pyCmd} ${PYTHON_SCRIPT}`)
    console.log(`[runPython] PYTHONPATH: ${env.PYTHONPATH || '(未设置)'}`)
    const py = spawn(pyCmd, [PYTHON_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
      env,
    })

    let stdout = ''
    let stderr = ''

    py.stdout.on('data', (d) => { stdout += d.toString() })
    py.stderr.on('data', (d) => { stderr += d.toString() })

    py.on('close', (code, signal) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Python exited ${code}: ${stderr.slice(0, 500)}`))
      } else if (signal) {
        let hint = ''
        if (signal === 'SIGKILL') hint = '（可能内存不足 OOM，Railway 免费版约 512MB）'
        else if (signal === 'SIGTERM') hint = '（Railway 可能因健康检查失败或部署重启而终止容器）'
        reject(new Error(`Python 进程被信号终止: ${signal}${hint}. stderr: ${stderr.slice(0, 300) || '(无)'}`))
      } else if (code !== 0) {
        reject(new Error(`Python 异常退出: ${stderr.slice(0, 500) || '(无 stderr)'}`))
      } else {
        try {
          resolve(JSON.parse(stdout))
        } catch (e) {
          reject(new Error(`Invalid JSON: ${stdout.slice(0, 200)}`))
        }
      }
    })

    py.on('error', (err) => {
      console.error('[runPython] spawn error:', err)
      reject(err)
    })
    const inputStr = JSON.stringify(input)
    console.log(`[runPython] 输入数据长度: ${inputStr.length} chars`)
    py.stdin.write(inputStr)
    py.stdin.end()
  })
}

/**
 * @route POST /api/optimize
 * @body { params?: object, extra_constraints?: array, save?: boolean, name?: string }
 */
router.post('/', async (req, res) => {
  const startTime = Date.now()
  console.log(`[optimize] 开始求解, params=${JSON.stringify(req.body.params)}, save=${req.body.save}`)
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

    const elapsed = Date.now() - startTime
    console.log(`[optimize] 求解成功，耗时 ${elapsed}ms`)
    res.json(result)
  } catch (err) {
    const elapsed = Date.now() - startTime
    console.error(`[optimize] 求解失败，耗时 ${elapsed}ms:`, err)
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
