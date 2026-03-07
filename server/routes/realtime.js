/**
 * 实时数据 API
 * GET  /api/realtime/latest       — 最新 24h 三路数据
 * GET  /api/realtime/history      — 历史某日数据 (时光回溯)
 * GET  /api/realtime/health       — 数据源健康状态
 * GET  /api/realtime/alerts       — 最近预警事件
 * POST /api/realtime/fetch        — 手动触发一次数据采集
 * GET  /api/realtime/config       — 获取园区配置（坐标等）
 * PUT  /api/realtime/config       — 修改园区配置
 * GET  /api/realtime/dates        — 获取有数据的日期列表
 */

import { Router } from 'express'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getDb } from '../db/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FETCHER_SCRIPT = join(__dirname, '..', 'python', 'data_fetcher.py')

const router = Router()

/** 运行 data_fetcher.py 并返回 JSON 结果 */
function runFetcher(args = []) {
  return new Promise((resolve, reject) => {
    const py = spawn('python', [FETCHER_SCRIPT, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    })

    let stdout = ''
    let stderr = ''

    py.stdout.on('data', (d) => { stdout += d.toString() })
    py.stderr.on('data', (d) => { stderr += d.toString() })

    py.on('close', (code) => {
      if (stderr) console.log('[data_fetcher stderr]', stderr.slice(0, 500))
      if (code !== 0) {
        reject(new Error(`data_fetcher exited ${code}: ${stderr.slice(0, 300)}`))
      } else {
        try {
          resolve(JSON.parse(stdout))
        } catch (e) {
          reject(new Error(`Invalid JSON from data_fetcher: ${stdout.slice(0, 200)}`))
        }
      }
    })

    py.on('error', (err) => reject(err))
  })
}

/**
 * GET /api/realtime/latest
 * 返回今天的 24h 实时数据（若无数据则自动触发采集）
 */
router.get('/latest', async (req, res) => {
  try {
    const db = getDb()
    const today = new Date().toISOString().slice(0, 10)
    const rows = db.prepare(
      'SELECT * FROM realtime_data WHERE data_date = ? ORDER BY hour'
    ).all(today)

    if (rows.length >= 24) {
      return res.json(formatRows(rows, today))
    }

    // 无数据, 自动触发一次采集
    const config = getParkConfig(db)
    const result = await runFetcher([
      '--once', '--lat', String(config.latitude), '--lon', String(config.longitude), '--dramatic'
    ])
    res.json(result)
  } catch (err) {
    console.error('[realtime/latest]', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/realtime/history?date=YYYY-MM-DD
 * 返回指定日期的 24h 数据
 */
router.get('/history', async (req, res) => {
  try {
    const dateStr = req.query.date
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: '需要 date 参数，格式 YYYY-MM-DD' })
    }

    const db = getDb()
    const rows = db.prepare(
      'SELECT * FROM realtime_data WHERE data_date = ? ORDER BY hour'
    ).all(dateStr)

    if (rows.length >= 24) {
      return res.json(formatRows(rows, dateStr))
    }

    // 自动从 Archive API 获取历史数据
    const config = getParkConfig(db)
    const result = await runFetcher([
      '--once', '--date', dateStr,
      '--lat', String(config.latitude), '--lon', String(config.longitude)
    ])
    res.json(result)
  } catch (err) {
    console.error('[realtime/history]', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/realtime/health
 * 返回三路数据源健康状态
 */
router.get('/health', (req, res) => {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM data_source_health').all()
    const health = {}
    for (const r of rows) {
      health[r.source_name] = {
        status: r.status,
        lastSuccess: r.last_success,
        lastError: r.last_error,
        fallbackActive: !!r.fallback_active,
        updatedAt: r.updated_at,
      }
    }
    res.json(health)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/realtime/alerts?limit=10&severity=warning
 * 返回最近预警事件
 */
router.get('/alerts', (req, res) => {
  try {
    const db = getDb()
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100)
    const severity = req.query.severity

    let sql = 'SELECT * FROM alert_events'
    const params = []
    if (severity) {
      sql += ' WHERE severity = ?'
      params.push(severity)
    }
    sql += ' ORDER BY created_at DESC LIMIT ?'
    params.push(limit)

    const rows = db.prepare(sql).all(...params)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/realtime/fetch
 * 手动触发数据采集
 * body: { date?: string, seed?: number, dramatic?: boolean }
 */
router.post('/fetch', async (req, res) => {
  try {
    const db = getDb()
    const config = getParkConfig(db)
    const args = ['--once', '--lat', String(config.latitude), '--lon', String(config.longitude)]

    if (req.body.date) {
      args.push('--date', req.body.date)
    }
    if (req.body.dramatic) {
      args.push('--dramatic')
    } else if (req.body.seed != null) {
      args.push('--seed', String(req.body.seed))
    }

    const result = await runFetcher(args)
    res.json(result)
  } catch (err) {
    console.error('[realtime/fetch]', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/realtime/config
 * 获取园区配置
 */
router.get('/config', (req, res) => {
  try {
    const db = getDb()
    const config = getParkConfig(db)
    res.json(config)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * PUT /api/realtime/config
 * 修改园区配置
 * body: { latitude?: number, longitude?: number, park_name?: string }
 */
router.put('/config', (req, res) => {
  try {
    const db = getDb()
    const allowed = ['latitude', 'longitude', 'park_name']
    const updates = []
    for (const key of allowed) {
      if (req.body[key] != null) {
        db.prepare(
          'INSERT INTO park_config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP'
        ).run(key, String(req.body[key]))
        updates.push(key)
      }
    }
    res.json({ updated: updates, config: getParkConfig(db) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/realtime/dates
 * 获取数据库中有数据的日期列表
 */
router.get('/dates', (req, res) => {
  try {
    const db = getDb()
    const rows = db.prepare(
      'SELECT DISTINCT data_date FROM realtime_data ORDER BY data_date DESC LIMIT 365'
    ).all()
    res.json(rows.map(r => r.data_date))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── helpers ───

function getParkConfig(db) {
  const rows = db.prepare('SELECT key, value FROM park_config').all()
  const config = { latitude: 30.26, longitude: 120.19, park_name: '杭州示范园区' }
  for (const r of rows) {
    if (r.key === 'latitude' || r.key === 'longitude') {
      config[r.key] = parseFloat(r.value)
    } else {
      config[r.key] = r.value
    }
  }
  return config
}

function formatRows(rows, dateStr) {
  const prices = []
  const solar = []
  const carbon = []
  const wind10 = []
  const wind80 = []
  const temperature = []
  let priceSrc = 'fallback'
  let solarSrc = 'fallback'
  let carbonSrc = 'fallback'
  let fetchedAt = ''

  for (const r of rows) {
    prices.push(r.price_grid)
    solar.push(r.shortwave_radiation)
    carbon.push(r.ef_grid)
    wind10.push(r.wind_speed_10m)
    wind80.push(r.wind_speed_80m)
    temperature.push(r.temperature)
    priceSrc = r.price_source
    solarSrc = r.solar_source
    carbonSrc = r.carbon_source
    fetchedAt = r.fetched_at
  }

  // 构造 optimizer_overrides
  const radArr = solar
  const gMax = Math.max(...radArr, 1)
  const gProfile = radArr.map(v => v / gMax)
  const gScale = gMax / 1000 * 1.5

  return {
    date: dateStr,
    prices,
    solar,
    carbon,
    wind10,
    wind80,
    temperature,
    sources: { price: priceSrc, solar: solarSrc, carbon: carbonSrc },
    alerts: [],
    optimizer_overrides: {
      price_grid: prices,
      EF_grid: carbon,
      G_profile: gProfile,
      G_scale: Math.round(gScale * 10000) / 10000,
    },
    fetched_at: fetchedAt,
  }
}

export default router
export { getParkConfig }
