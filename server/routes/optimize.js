import { Router } from 'express'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getDb } from '../db/index.js'
import { getBeijingDate, formatBeijingDateTime } from '../lib/time.js'
import { pushServerLog } from '../ws.js'
import { getParkConfig, runFetcherProcess } from '../services/realtimeRefresh.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PYTHON_SCRIPT = join(__dirname, '..', 'python', 'optimizer.py')
const H2_MOLAR_MASS = 2.016
const CLOUDY_WEATHER_SCALE = 0.58

const router = Router()

export function getDateOffset(days = 0) {
  const base = new Date(`${getBeijingDate()}T00:00:00+08:00`)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

export function getRealtimeOverrides(date = getBeijingDate(), weatherMode = 'forecast') {
  try {
    const db = getDb()
    const rows = db.prepare(
      'SELECT hour, price_grid, ef_grid, shortwave_radiation FROM realtime_data WHERE data_date = ? ORDER BY hour'
    ).all(date)

    if (rows.length < 24) return null

    const prices = rows.map((row) => row.price_grid)
    const efGrid = rows.map((row) => row.ef_grid)
    const weatherScale = weatherMode === 'cloudy' ? CLOUDY_WEATHER_SCALE : 1
    const radiation = rows.map((row) => row.shortwave_radiation * weatherScale)
    const gMax = Math.max(...radiation, 1)
    const gProfile = radiation.map((value) => value / gMax)
    const gScale = gMax / 1000 * 1.5

    return {
      targetDate: date,
      weatherMode,
      weatherScaleApplied: weatherScale === 1 ? null : weatherScale,
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
      targetDate: date,
      detail: error.message,
    })
    return null
  }
}

export function mergeRealtimeParams(userParams, options = {}) {
  const realtime = getRealtimeOverrides(options.targetDate ?? getBeijingDate(), options.weatherMode ?? 'forecast')
  if (!realtime) return userParams

  const merged = { ...userParams }
  for (const key of ['price_grid', 'EF_grid', 'G_profile', 'G_scale']) {
    if (merged[key] == null && realtime[key] != null) {
      merged[key] = realtime[key]
    }
  }
  return merged
}

function applyWeatherModeToOverrides(overrides, weatherMode = 'forecast') {
  if (!overrides || typeof overrides !== 'object') return null
  if (weatherMode !== 'cloudy') {
    return {
      ...overrides,
      weatherMode,
      weatherScaleApplied: null,
    }
  }

  const baseProfile = Array.isArray(overrides.G_profile) ? overrides.G_profile : []
  const scaledProfile = baseProfile.map((value) => Number(value || 0) * CLOUDY_WEATHER_SCALE)
  const maxProfile = Math.max(...scaledProfile, 0)
  const normalizedProfile = maxProfile > 0
    ? scaledProfile.map((value) => value / maxProfile)
    : scaledProfile
  const baseScale = typeof overrides.G_scale === 'number' ? overrides.G_scale : 0

  return {
    ...overrides,
    weatherMode,
    weatherScaleApplied: CLOUDY_WEATHER_SCALE,
    G_profile: normalizedProfile,
    G_scale: baseScale * CLOUDY_WEATHER_SCALE,
  }
}

async function getRealtimeOverridesForDate(date = getBeijingDate(), weatherMode = 'forecast') {
  const cached = getRealtimeOverrides(date, weatherMode)
  if (cached) return cached

  const config = getParkConfig(getDb())
  pushServerLog({
    level: 'warn',
    status: 'progress',
    scope: 'fetch',
    message: '目标日 forecast 快照缺失，开始自动补抓',
    targetDate: date,
    range: `${date} 00:00-23:00`,
    algorithm: 'DataFetcher aggregator',
    detail: `weather=${weatherMode}`,
  })

  const fetchResult = await runFetcherProcess([
    '--once',
    '--date', date,
    '--lat', String(config.latitude),
    '--lon', String(config.longitude),
  ], { targetDate: date })

  if (!fetchResult?.optimizer_overrides) return null

  return applyWeatherModeToOverrides({
    targetDate: date,
    price_grid: fetchResult.optimizer_overrides.price_grid,
    EF_grid: fetchResult.optimizer_overrides.EF_grid,
    G_profile: fetchResult.optimizer_overrides.G_profile,
    G_scale: fetchResult.optimizer_overrides.G_scale,
  }, weatherMode)
}

export function runPython(input, context = {}) {
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

router.post('/plan', async (req, res) => {
  try {
    const {
      prompt = '次日计划调度',
      targetDate = getDateOffset(1),
      H2_target = null,
      weatherMode = 'forecast',
      extra_constraints = [],
      save = false,
      name,
    } = req.body ?? {}

    const realtimeOverrides = await getRealtimeOverridesForDate(targetDate, weatherMode)
    const mergedParams = realtimeOverrides
      ? mergeRealtimeParams(realtimeOverrides, { targetDate, weatherMode })
      : mergeRealtimeParams({}, { targetDate, weatherMode })
    if (!mergedParams.price_grid || !mergedParams.EF_grid || !mergedParams.G_profile) {
      throw new Error(`未找到 ${targetDate} 的预测电价/碳因子/光照数据`)
    }

    if (typeof H2_target === 'number' && Number.isFinite(H2_target) && H2_target > 0) {
      mergedParams.H2_target = (H2_target * 1000) / H2_MOLAR_MASS
    }

    pushServerLog({
      level: 'info',
      status: 'progress',
      scope: 'api',
      message: '收到次日计划调度请求',
      targetDate,
      algorithm: 'MILP next-day dispatch',
      detail: `weather=${weatherMode} | H2=${typeof H2_target === 'number' ? `${H2_target}kg` : 'default'}`,
    })

    const result = await runPython({
      mode: 'all',
      params: mergedParams,
      extra_constraints,
    }, { targetDate })

    result._meta = {
      datasetType: 'planning',
      viewDate: targetDate,
      snapshotAt: formatBeijingDateTime(),
      isHistorical: false,
      containsForecast: true,
      forecastFromHour: 0,
      datasetName: name || prompt,
    }

    if (save) {
      const db = getDb()
      const dsName = name || `${prompt} ${targetDate}`
      const stmt = db.prepare('INSERT INTO datasets (name, data) VALUES (?, ?)')
      const info = stmt.run(dsName, JSON.stringify(result))
      result._datasetId = info.lastInsertRowid
      result._meta = { ...result._meta, datasetId: Number(result._datasetId), datasetName: dsName }
    }

    res.json({
      data: result,
      label: name || prompt,
      meta: {
        targetDate,
        weatherMode,
        H2TargetKg: typeof H2_target === 'number' && Number.isFinite(H2_target) ? H2_target : null,
        weatherScaleApplied: weatherMode === 'cloudy' ? CLOUDY_WEATHER_SCALE : null,
      },
    })
  } catch (error) {
    console.error('[optimize/plan]', error)
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
