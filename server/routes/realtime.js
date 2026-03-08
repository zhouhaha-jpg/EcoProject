import { Router } from 'express'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getDb, findRuntimeDatasetByViewDate, getLatestRuntimeDataset } from '../db/index.js'
import {
  formatBeijingDateTime,
  formatSqliteUtcToBeijing,
  getBeijingDate,
  parseSqliteUtcTimestamp,
} from '../lib/time.js'
import { pushServerLog } from '../ws.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FETCHER_SCRIPT = join(__dirname, '..', 'python', 'data_fetcher.py')
const OPTIMIZER_SCRIPT = join(__dirname, '..', 'python', 'optimizer.py')
const LIVE_REFRESH_INTERVAL_MS = 5 * 60 * 1000

const router = Router()

function runFetcher(args = [], context = {}) {
  const targetDate = context.targetDate || readArgValue(args, '--date') || getBeijingDate()
  const latitude = readArgValue(args, '--lat')
  const longitude = readArgValue(args, '--lon')

  pushServerLog({
    level: 'info',
    status: 'start',
    scope: 'fetch',
    message: '开始获取外部实时数据',
    targetDate,
    range: `${targetDate} 00:00-23:00`,
    algorithm: 'DataFetcher aggregator',
    detail: latitude && longitude ? `坐标 ${latitude}, ${longitude}` : '使用默认园区坐标',
  })

  return new Promise((resolve, reject) => {
    const py = spawn('python', [FETCHER_SCRIPT, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
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
      if (stderr) {
        console.log('[data_fetcher stderr]', stderr.slice(0, 500))
      }

      if (code !== 0) {
        const error = new Error(`data_fetcher exited ${code}: ${stderr.slice(0, 300)}`)
        pushServerLog({
          level: 'err',
          status: 'error',
          scope: 'fetch',
          message: '外部实时数据获取失败',
          targetDate,
          range: `${targetDate} 00:00-23:00`,
          algorithm: 'DataFetcher aggregator',
          detail: stderr.slice(0, 240) || error.message,
        })
        reject(error)
        return
      }

      try {
        const result = JSON.parse(stdout)
        pushServerLog({
          level: 'ok',
          status: 'done',
          scope: 'fetch',
          message: '外部实时数据获取完成',
          targetDate: result.date || targetDate,
          range: `${result.date || targetDate} 00:00-23:00`,
          algorithm: 'DataFetcher aggregator',
          detail: `price=${result.sources?.price || '-'} | solar=${result.sources?.solar || '-'} | carbon=${result.sources?.carbon || '-'}`,
        })
        resolve(result)
      } catch {
        const error = new Error(`Invalid JSON from data_fetcher: ${stdout.slice(0, 200)}`)
        pushServerLog({
          level: 'err',
          status: 'error',
          scope: 'fetch',
          message: '外部实时数据解析失败',
          targetDate,
          algorithm: 'DataFetcher aggregator',
          detail: error.message,
        })
        reject(error)
      }
    })

    py.on('error', (error) => {
      pushServerLog({
        level: 'err',
        status: 'error',
        scope: 'fetch',
        message: '数据抓取进程启动失败',
        targetDate,
        algorithm: 'DataFetcher aggregator',
        detail: error.message,
      })
      reject(error)
    })
  })
}

function runOptimizer(params = {}, context = {}) {
  const targetDate = context.targetDate || getBeijingDate()
  pushServerLog({
    level: 'info',
    status: 'start',
    scope: 'optimize',
    message: '开始计算展示用优化结果',
    targetDate,
    range: `${targetDate} 00:00-23:00`,
    algorithm: 'MILP 6-strategy dispatch',
    detail: '基于数据库中最新 24h 实时参数',
  })

  return new Promise((resolve, reject) => {
    const py = spawn('python', [OPTIMIZER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
    })

    let stdout = ''
    let stderr = ''
    const startedAt = Date.now()

    py.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    py.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    py.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(`optimizer exited ${code}: ${stderr.slice(0, 300)}`)
        pushServerLog({
          level: 'err',
          status: 'error',
          scope: 'optimize',
          message: '展示优化计算失败',
          targetDate,
          range: `${targetDate} 00:00-23:00`,
          algorithm: 'MILP 6-strategy dispatch',
          detail: stderr.slice(0, 240) || error.message,
        })
        reject(error)
        return
      }

      try {
        const result = JSON.parse(stdout)
        pushServerLog({
          level: 'ok',
          status: 'done',
          scope: 'optimize',
          message: '展示优化计算完成',
          targetDate,
          range: `${targetDate} 00:00-23:00`,
          algorithm: 'MILP 6-strategy dispatch',
          detail: `耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
        })
        resolve(result)
      } catch {
        const error = new Error(`Invalid JSON from optimizer: ${stdout.slice(0, 200)}`)
        pushServerLog({
          level: 'err',
          status: 'error',
          scope: 'optimize',
          message: '展示优化输出解析失败',
          targetDate,
          algorithm: 'MILP 6-strategy dispatch',
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
        message: '展示优化进程启动失败',
        targetDate,
        algorithm: 'MILP 6-strategy dispatch',
        detail: error.message,
      })
      reject(error)
    })

    py.stdin.write(JSON.stringify({ mode: 'all', params }))
    py.stdin.end()
  })
}

router.get('/latest', async (req, res) => {
  try {
    const db = getDb()
    const today = getBeijingDate()
    const rows = db.prepare(
      'SELECT * FROM realtime_data WHERE data_date = ? ORDER BY hour'
    ).all(today)
    const stale = isLiveRawDataStale(db, today)

    if (rows.length >= 24 && !stale) {
      pushServerLog({
        level: 'info',
        status: 'done',
        scope: 'cache',
        message: '命中北京时间今日实时数据缓存',
        targetDate: today,
        range: `${today} 00:00-23:00`,
        detail: `共 ${rows.length} 条小时数据`,
      })
      return res.json(formatRows(rows, today))
    }

    pushServerLog({
      level: stale ? 'warn' : 'info',
      status: 'progress',
      scope: 'fetch',
      message: stale ? '今日实时数据已过期，开始刷新' : '今日实时数据不足 24 条，开始补抓',
      targetDate: today,
      range: `${today} 00:00-23:00`,
      detail: `当前 ${rows.length} 条 | 刷新窗口 ${LIVE_REFRESH_INTERVAL_MS / 60000} 分钟`,
    })

    const config = getParkConfig(db)
    const result = await runFetcher([
      '--once',
      '--lat', String(config.latitude),
      '--lon', String(config.longitude),
    ], { targetDate: today })
    res.json(result)
  } catch (error) {
    console.error('[realtime/latest]', error)
    pushServerLog({
      level: 'err',
      status: 'error',
      scope: 'api',
      message: '读取最新实时数据失败',
      targetDate: getBeijingDate(),
      detail: error.message,
    })
    res.status(500).json({ error: error.message })
  }
})

router.get('/display', async (req, res) => {
  try {
    const db = getDb()
    const requestedDate = req.query.date ? String(req.query.date) : ''

    if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
    }

    if (requestedDate) {
      const cached = findRuntimeDatasetByViewDate(requestedDate)
      if (cached) {
        pushServerLog({
          level: 'info',
          status: 'done',
          scope: 'cache',
          message: '命中时光回溯展示缓存',
          targetDate: requestedDate,
          range: `${requestedDate} 00:00-23:00`,
          detail: `${cached.name} | datasetId ${cached.id}`,
        })
        return res.json(normalizeDatasetResponse(cached, requestedDate, 'history'))
      }

      pushServerLog({
        level: 'warn',
        status: 'progress',
        scope: 'history',
        message: '历史展示缓存未命中，开始构建回溯结果',
        targetDate: requestedDate,
        range: `${requestedDate} 00:00-23:00`,
        algorithm: 'Archive fetch + MILP 6-strategy dispatch',
      })

      const built = await buildDatasetForDate(db, requestedDate, {
        save: true,
        datasetType: 'history',
      })
      return res.json(built)
    }

    const today = getBeijingDate()
    const latestDateRow = db.prepare(
      'SELECT data_date FROM realtime_data ORDER BY data_date DESC LIMIT 1'
    ).get()
    const latestDate = latestDateRow?.data_date || today
    const latestDataset = getLatestRuntimeDataset('realtime') || getLatestRuntimeDataset()
    const shouldRefreshLive = latestDate === today && isLiveRawDataStale(db, today)

    if (latestDataset && !shouldRefreshLive) {
      pushServerLog({
        level: 'info',
        status: 'done',
        scope: 'cache',
        message: '加载数据库中最新展示结果',
        targetDate: latestDate,
        range: `${latestDate} 00:00-23:00`,
        detail: `${latestDataset.name} | datasetId ${latestDataset.id}`,
      })
      return res.json(normalizeDatasetResponse(latestDataset, latestDate))
    }

    if (shouldRefreshLive) {
      pushServerLog({
        level: 'warn',
        status: 'progress',
        scope: 'display',
        message: '实时展示快照已过期，开始重抓并重算',
        targetDate: today,
        range: `${today} 00:00-23:00`,
        algorithm: 'Realtime fetch + MILP 6-strategy dispatch',
        detail: `刷新窗口 ${LIVE_REFRESH_INTERVAL_MS / 60000} 分钟`,
      })
    } else {
      pushServerLog({
        level: 'warn',
        status: 'progress',
        scope: 'display',
        message: '尚无展示结果缓存，开始即时构建',
        targetDate: latestDate,
        range: `${latestDate} 00:00-23:00`,
        algorithm: 'Realtime cache + MILP 6-strategy dispatch',
      })
    }

    const built = await buildDatasetForDate(db, shouldRefreshLive ? today : latestDate, {
      save: true,
      datasetType: shouldRefreshLive ? 'realtime' : latestDate === today ? 'realtime' : 'history',
      forceRefresh: shouldRefreshLive,
    })
    res.json(built)
  } catch (error) {
    console.error('[realtime/display]', error)
    pushServerLog({
      level: 'err',
      status: 'error',
      scope: 'api',
      message: '加载展示数据失败',
      targetDate: String(req.query.date || getBeijingDate()),
      detail: error.message,
    })
    res.status(500).json({ error: error.message })
  }
})

router.get('/history', async (req, res) => {
  try {
    const dateStr = String(req.query.date || '')
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
    }

    const db = getDb()
    const rows = db.prepare(
      'SELECT * FROM realtime_data WHERE data_date = ? ORDER BY hour'
    ).all(dateStr)

    if (rows.length >= 24) {
      pushServerLog({
        level: 'info',
        status: 'done',
        scope: 'history',
        message: '命中历史 24h 数据缓存',
        targetDate: dateStr,
        range: `${dateStr} 00:00-23:00`,
        detail: `共 ${rows.length} 条小时数据`,
      })
      return res.json(formatRows(rows, dateStr))
    }

    pushServerLog({
      level: 'warn',
      status: 'progress',
      scope: 'history',
      message: '历史数据不足 24 条，开始补抓',
      targetDate: dateStr,
      range: `${dateStr} 00:00-23:00`,
      algorithm: 'Archive fetch',
      detail: `当前 ${rows.length} 条`,
    })

    const config = getParkConfig(db)
    const result = await runFetcher([
      '--once',
      '--date', dateStr,
      '--lat', String(config.latitude),
      '--lon', String(config.longitude),
    ], { targetDate: dateStr })

    res.json(result)
  } catch (error) {
    console.error('[realtime/history]', error)
    pushServerLog({
      level: 'err',
      status: 'error',
      scope: 'api',
      message: '读取历史实时数据失败',
      targetDate: String(req.query.date || ''),
      detail: error.message,
    })
    res.status(500).json({ error: error.message })
  }
})

router.get('/health', (req, res) => {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM data_source_health').all()
    const health = {}
    for (const row of rows) {
      health[row.source_name] = {
        status: row.status,
        lastSuccess: row.last_success,
        lastError: row.last_error,
        fallbackActive: !!row.fallback_active,
        updatedAt: row.updated_at,
      }
    }
    res.json(health)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

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
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/fetch', async (req, res) => {
  try {
    const db = getDb()
    const config = getParkConfig(db)
    const targetDate = req.body.date || getBeijingDate()
    const args = ['--once', '--lat', String(config.latitude), '--lon', String(config.longitude)]

    if (req.body.date) {
      args.push('--date', req.body.date)
    }
    if (req.body.dramatic) {
      args.push('--dramatic')
    } else if (req.body.seed != null) {
      args.push('--seed', String(req.body.seed))
    }

    pushServerLog({
      level: 'info',
      status: 'progress',
      scope: 'api',
      message: '收到手动数据抓取请求',
      targetDate,
      range: `${targetDate} 00:00-23:00`,
      algorithm: 'DataFetcher aggregator',
      detail: req.body.dramatic ? 'dramatic mode' : (req.body.seed != null ? `seed=${req.body.seed}` : 'normal mode'),
    })

    const result = await runFetcher(args, { targetDate })
    res.json(result)
  } catch (error) {
    console.error('[realtime/fetch]', error)
    pushServerLog({
      level: 'err',
      status: 'error',
      scope: 'api',
      message: '手动数据抓取失败',
      targetDate: req.body?.date || getBeijingDate(),
      detail: error.message,
    })
    res.status(500).json({ error: error.message })
  }
})

router.get('/config', (req, res) => {
  try {
    const db = getDb()
    const config = getParkConfig(db)
    res.json(config)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

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

    if (updates.length) {
      pushServerLog({
        level: 'ok',
        status: 'done',
        scope: 'config',
        message: '园区配置已更新',
        detail: updates.join(', '),
      })
    }

    res.json({ updated: updates, config: getParkConfig(db) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/dates', (req, res) => {
  try {
    const db = getDb()
    const rows = db.prepare(
      'SELECT DISTINCT data_date FROM realtime_data ORDER BY data_date DESC LIMIT 365'
    ).all()
    res.json(rows.map((row) => row.data_date))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

function getParkConfig(db) {
  const rows = db.prepare('SELECT key, value FROM park_config').all()
  const config = { latitude: 30.26, longitude: 120.19, park_name: '杭州示范园区' }

  for (const row of rows) {
    if (row.key === 'latitude' || row.key === 'longitude') {
      config[row.key] = parseFloat(row.value)
    } else {
      config[row.key] = row.value
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

  for (const row of rows) {
    prices.push(row.price_grid)
    solar.push(row.shortwave_radiation)
    carbon.push(row.ef_grid)
    wind10.push(row.wind_speed_10m)
    wind80.push(row.wind_speed_80m)
    temperature.push(row.temperature)
    priceSrc = row.price_source
    solarSrc = row.solar_source
    carbonSrc = row.carbon_source
    fetchedAt = formatSqliteUtcToBeijing(row.fetched_at)
  }

  const gMax = Math.max(...solar, 1)
  const gProfile = solar.map((value) => value / gMax)
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

function buildDatasetMeta({ row, datasetType = 'realtime', viewDate, snapshotAt }) {
  const inferredType = row?.data?._meta?.datasetType
    ?? (row?.name?.startsWith('时光回溯 ') ? 'history' : datasetType)
  const resolvedType = datasetType === 'history' ? 'history' : inferredType
  const inferredDate = row?.data?._meta?.viewDate ?? viewDate ?? extractDateFromName(row?.name) ?? getBeijingDate()
  const inferredSnapshot = normalizeSnapshotAt(row?.data?._meta?.snapshotAt || snapshotAt)
    || (row?.created_at ? formatSqliteUtcToBeijing(row.created_at) : formatBeijingDateTime())

  return {
    datasetType: resolvedType,
    viewDate: inferredDate,
    snapshotAt: inferredSnapshot,
    isHistorical: resolvedType === 'history',
    datasetId: row?.id ?? null,
    datasetName: row?.name ?? '',
  }
}

function normalizeSnapshotAt(value) {
  if (!value) return ''
  const parsed = parseBeijingTimestamp(value) ?? new Date(value)
  if (!Number.isNaN(parsed?.getTime?.())) {
    return formatBeijingDateTime(parsed)
  }
  return String(value).replace('T', ' ').slice(0, 19)
}

function normalizeDatasetResponse(row, fallbackDate = '', datasetType = 'realtime') {
  const meta = buildDatasetMeta({ row, viewDate: fallbackDate, datasetType })
  const data = { ...row.data, _meta: meta }
  return { data, meta, id: row.id, name: row.name }
}

function extractDateFromName(name = '') {
  const match = String(name).match(/\d{4}-\d{2}-\d{2}/)
  return match?.[0] ?? ''
}

function readArgValue(args, flag) {
  const index = args.indexOf(flag)
  if (index === -1) return ''
  return args[index + 1] ? String(args[index + 1]) : ''
}

function parseBeijingTimestamp(value) {
  if (!value) return null
  const text = String(value).trim()
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return new Date(text.replace(' ', 'T') + '+08:00')
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)) {
    return new Date(text + '+08:00')
  }
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getLatestRawFetchDate(db, dateStr) {
  const row = db.prepare(
    'SELECT fetched_at FROM realtime_data WHERE data_date = ? ORDER BY fetched_at DESC LIMIT 1'
  ).get(dateStr)
  return row?.fetched_at ? parseSqliteUtcTimestamp(row.fetched_at) : null
}

function isLiveRawDataStale(db, dateStr) {
  if (dateStr !== getBeijingDate()) return false
  const latestFetch = getLatestRawFetchDate(db, dateStr)
  if (!latestFetch) return true
  return Date.now() - latestFetch.getTime() > LIVE_REFRESH_INTERVAL_MS
}

async function ensureRowsForDate(db, dateStr, { forceRefresh = false } = {}) {
  const existing = db.prepare(
    'SELECT * FROM realtime_data WHERE data_date = ? ORDER BY hour'
  ).all(dateStr)

  if (existing.length >= 24 && !forceRefresh) {
    pushServerLog({
      level: 'info',
      status: 'done',
      scope: 'cache',
      message: '构建展示结果时命中原始 24h 数据缓存',
      targetDate: dateStr,
      range: `${dateStr} 00:00-23:00`,
      detail: `共 ${existing.length} 条小时数据`,
    })
    return formatRows(existing, dateStr)
  }

  const config = getParkConfig(db)
  return runFetcher([
    '--once',
    '--date', dateStr,
    '--lat', String(config.latitude),
    '--lon', String(config.longitude),
  ], { targetDate: dateStr })
}

async function buildDatasetForDate(db, dateStr, options = {}) {
  const { save = false, datasetType = 'history', forceRefresh = false } = options
  const realtimePayload = await ensureRowsForDate(db, dateStr, { forceRefresh })
  const optimized = await runOptimizer(realtimePayload.optimizer_overrides || {}, { targetDate: dateStr })
  const meta = buildDatasetMeta({
    datasetType,
    viewDate: dateStr,
    snapshotAt: realtimePayload.fetched_at || formatBeijingDateTime(),
  })
  const data = { ...optimized, _meta: meta }

  let datasetId = null
  let datasetName = ''
  if (save) {
    datasetName = datasetType === 'history'
      ? `时光回溯 ${dateStr} ${formatBeijingDateTime()}`
      : `实时优化 ${formatBeijingDateTime()}`
    const info = db.prepare('INSERT INTO datasets (name, data) VALUES (?, ?)').run(datasetName, JSON.stringify(data))
    datasetId = Number(info.lastInsertRowid)
    data._meta = { ...meta, datasetId, datasetName }

    pushServerLog({
      level: 'ok',
      status: 'done',
      scope: 'storage',
      message: datasetType === 'history' ? '历史展示结果已入库' : '实时展示结果已入库',
      targetDate: dateStr,
      range: `${dateStr} 00:00-23:00`,
      algorithm: 'SQLite datasets',
      detail: `datasetId ${datasetId} | ${datasetName}`,
    })
  }

  return {
    data,
    meta: data._meta,
    id: datasetId,
    name: datasetName,
  }
}

export default router
export { getParkConfig }
