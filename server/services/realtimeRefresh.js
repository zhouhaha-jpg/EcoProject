import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getDb } from '../db/index.js'
import { formatBeijingDateTime, getBeijingDate } from '../lib/time.js'
import {
  broadcastAlert,
  broadcastDataUpdate,
  broadcastDatasetUpdated,
  broadcastHealthUpdate,
  broadcastOptimizationComplete,
  pushServerLog,
} from '../ws.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FETCHER_SCRIPT = join(__dirname, '..', 'python', 'data_fetcher.py')
const OPTIMIZER_SCRIPT = join(__dirname, '..', 'python', 'optimizer.py')

function readArgValue(args, flag) {
  const index = args.indexOf(flag)
  if (index === -1) return ''
  return args[index + 1] ? String(args[index + 1]) : ''
}

function buildForecastDetail(payload) {
  if (!payload?.contains_forecast || payload.forecast_from_hour == null) return 'no forecast hours'
  return `forecast ${String(payload.forecast_from_hour).padStart(2, '0')}:00-23:00`
}

export function getParkConfig(db = getDb()) {
  const rows = db.prepare('SELECT key, value FROM park_config').all()
  const config = { latitude: 30.26, longitude: 120.19, park_name: '杭州示范园区' }

  for (const row of rows) {
    if (row.key === 'latitude' || row.key === 'longitude') {
      config[row.key] = Number.parseFloat(row.value)
    } else {
      config[row.key] = row.value
    }
  }

  return config
}

export function buildRealtimeDatasetMeta(fetchResult, overrides = {}) {
  const snapshotAt = fetchResult?.fetched_at
    ? formatBeijingDateTime(fetchResult.fetched_at)
    : formatBeijingDateTime()

  return {
    datasetType: overrides.datasetType || 'realtime',
    viewDate: overrides.viewDate || fetchResult?.date || getBeijingDate(),
    snapshotAt,
    isHistorical: overrides.datasetType === 'history',
    datasetId: overrides.datasetId ?? null,
    datasetName: overrides.datasetName ?? '',
    containsForecast: Boolean(fetchResult?.contains_forecast),
    forecastFromHour: fetchResult?.forecast_from_hour ?? null,
  }
}

export function buildFallbackAlertText(fetchResult, datasetWithMeta) {
  const alerts = fetchResult?.alerts || []
  const critical = alerts.find((alert) => alert.severity === 'critical')
  const esSummary = datasetWithMeta?.summary?.es
  if (critical && esSummary) {
    return `检测到 ${critical.title}。系统已完成重新优化，建议查看最新 ES 方案。`
  }
  return '检测到外部信号变化，系统已完成新一轮优化，建议查看最新调度结果。'
}

export function runFetcherProcess(args = [], context = {}) {
  const targetDate = context.targetDate || readArgValue(args, '--date') || getBeijingDate()
  const latitude = readArgValue(args, '--lat')
  const longitude = readArgValue(args, '--lon')

  pushServerLog({
    level: 'info',
    status: 'start',
    scope: 'fetch',
    message: '开始抓取外部 24h 数据快照',
    targetDate,
    range: `${targetDate} 00:00-23:00`,
    algorithm: 'DataFetcher aggregator',
    detail: latitude && longitude ? `坐标 ${latitude}, ${longitude}` : '使用默认园区坐标',
  })

  return new Promise((resolve, reject) => {
    const py = spawn('python', [FETCHER_SCRIPT, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
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
          message: '外部数据抓取失败',
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
          message: '外部数据抓取完成',
          targetDate: result.date || targetDate,
          range: `${result.date || targetDate} 00:00-23:00`,
          algorithm: 'DataFetcher aggregator',
          detail: `price=${result.sources?.price || '-'} | solar=${result.sources?.solar || '-'} | carbon=${result.sources?.carbon || '-'} | ${buildForecastDetail(result)}`,
        })
        resolve(result)
      } catch {
        const error = new Error(`Invalid JSON from data_fetcher: ${stdout.slice(0, 200)}`)
        pushServerLog({
          level: 'err',
          status: 'error',
          scope: 'fetch',
          message: '抓取结果解析失败',
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

export function runOptimizerProcess(params = {}, context = {}) {
  const targetDate = context.targetDate || getBeijingDate()
  pushServerLog({
    level: 'info',
    status: 'start',
    scope: 'optimize',
    message: '开始计算展示用优化结果',
    targetDate,
    range: `${targetDate} 00:00-23:00`,
    algorithm: 'MILP 6-strategy dispatch',
    detail: '基于数据库中最新 24h 快照',
  })

  return new Promise((resolve, reject) => {
    const py = spawn('python', [OPTIMIZER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
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
          message: '优化输出解析失败',
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
        message: '优化进程启动失败',
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

export async function optimizeFetchedRealtime(fetchResult, options = {}) {
  const overrides = fetchResult.optimizer_overrides || {}
  const optimized = await runOptimizerProcess(overrides, { targetDate: fetchResult.date })
  const db = getDb()
  const datasetMeta = buildRealtimeDatasetMeta(fetchResult)
  const datasetWithMeta = { ...optimized, _meta: datasetMeta }
  const datasetName = `实时优化 ${formatBeijingDateTime()}`
  const info = db.prepare('INSERT INTO datasets (name, data) VALUES (?, ?)').run(datasetName, JSON.stringify(datasetWithMeta))
  const datasetId = Number(info.lastInsertRowid)
  datasetWithMeta._meta = buildRealtimeDatasetMeta(fetchResult, { datasetId, datasetName })

  pushServerLog({
    level: 'ok',
    status: 'done',
    scope: 'storage',
    message: '实时展示结果已入库',
    targetDate: fetchResult.date,
    range: `${fetchResult.date} 00:00-23:00`,
    algorithm: 'SQLite datasets',
    detail: `datasetId ${datasetId} | ${datasetName}`,
  })

  if (options.broadcast !== false) {
    broadcastDatasetUpdated({
      datasetId,
      datasetName,
      meta: datasetWithMeta._meta,
      data: datasetWithMeta,
    })
  }

  const alerts = fetchResult.alerts || []
  const hasCritical = alerts.some((alert) => alert.severity === 'critical')
  if (options.broadcast !== false && hasCritical) {
    const suggestion = options.generateAlertText
      ? await options.generateAlertText(fetchResult, datasetWithMeta)
      : buildFallbackAlertText(fetchResult, datasetWithMeta)
    broadcastOptimizationComplete({
      datasetId,
      datasetName,
      summary: datasetWithMeta.summary,
      alerts,
      suggestion,
    })
  }

  return {
    datasetId,
    datasetName,
    data: datasetWithMeta,
    meta: datasetWithMeta._meta,
    summary: datasetWithMeta.summary,
  }
}

export async function refreshRealtimeCycle(options = {}) {
  const targetDate = options.targetDate || getBeijingDate()
  const config = options.config || getParkConfig()
  const args = ['--once', '--lat', String(config.latitude), '--lon', String(config.longitude)]

  if (targetDate && targetDate !== getBeijingDate()) {
    args.push('--date', targetDate)
  }
  if (options.dramatic) {
    args.push('--dramatic')
  } else if (options.seed != null) {
    args.push('--seed', String(options.seed))
  }

  const fetchResult = await runFetcherProcess(args, { targetDate })

  if (options.broadcast !== false) {
    broadcastDataUpdate(fetchResult)
    broadcastHealthUpdate(fetchResult.sources)
    for (const alert of fetchResult.alerts || []) {
      broadcastAlert(alert)
      pushServerLog({
        level: alert.severity === 'critical' ? 'err' : 'warn',
        status: 'progress',
        scope: 'alert',
        message: alert.title || '检测到异常预警',
        targetDate: fetchResult.date,
        range: `${fetchResult.date} 00:00-23:00`,
        detail: alert.detail || alert.event_type || '',
      })
    }
  }

  const dataset = await optimizeFetchedRealtime(fetchResult, options)
  return { fetchResult, dataset }
}
