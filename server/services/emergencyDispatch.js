import {
  createEmergencyRun,
  getDatasetById,
  getDb,
  getEmergencyRunById,
  getLatestAppliedEmergencyRun,
  listEmergencyRuns,
  updateEmergencyRun,
} from '../db/index.js'
import {
  broadcastEmergencyApplied,
  broadcastEmergencyPlanCreated,
  broadcastEmergencyRestored,
  pushServerLog,
} from '../ws.js'
import { formatBeijingDateTime, getBeijingDate } from '../lib/time.js'

const STRATEGIES = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']
const STEP_MINUTES = 5
const WINDOW_HOURS = 4
const STEPS = (WINDOW_HOURS * 60) / STEP_MINUTES
const GM_FUEL_COST_PER_KWH = 0.42
const GM_CARBON_PER_KWH = 0.00078

const GRID_SUBJECT_RE = /(购电|电网|外部供电|市电|网电)/
const PV_SUBJECT_RE = /(光伏|太阳能|组件出力|光照)/
const MAX_LLM_ATTEMPTS = 3
const METRIC_ORDER = ['P_CA', 'P_PV', 'P_GM', 'P_PEM', 'P_G', 'P_es_es']
const MODULE_LABELS = {
  P_CA: '电解槽',
  P_PV: '光伏',
  P_GM: '燃机',
  P_PEM: 'PEM',
  P_G: '电网',
  P_es_es: '储能',
}
const RAMP_LIMITS = {
  P_CA: 420,
  P_PV: 260,
  P_GM: 180,
  P_PEM: 160,
  P_G: 420,
  P_es_es: 260,
}

const CN_DIGITS = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function ensureArray(value, length = 24, fill = 0) {
  const arr = Array.isArray(value) ? value.map((item) => toNumber(item, fill)) : []
  if (arr.length >= length) return arr.slice(0, length)
  return [...arr, ...Array.from({ length: length - arr.length }, () => fill)]
}

function average(values = []) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function maxValue(values = [], fallback = 0) {
  return values.length ? Math.max(...values) : fallback
}

function safeAt(values, index, fallback = 0) {
  return Array.isArray(values) && Number.isFinite(values[index]) ? values[index] : fallback
}

function interpolateHourlyWindow(hourly, startHour, points = STEPS) {
  const source = ensureArray(hourly)
  const out = []
  for (let i = 0; i < points; i += 1) {
    const pos = i / (60 / STEP_MINUTES)
    const leftHour = Math.floor(pos)
    const rightHour = Math.min(leftHour + 1, WINDOW_HOURS)
    const frac = pos - leftHour
    const leftIdx = clamp(startHour + leftHour, 0, 23)
    const rightIdx = clamp(startHour + rightHour, 0, 23)
    const left = source[leftIdx] ?? 0
    const right = source[rightIdx] ?? left
    out.push(left + (right - left) * frac)
  }
  return out
}

function avgChunk(values, chunkSize = 12) {
  const out = []
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize)
    const avg = chunk.reduce((sum, value) => sum + value, 0) / Math.max(chunk.length, 1)
    out.push(round(avg, 4))
  }
  return out
}

function parseChineseNumber(token = '') {
  const text = String(token).trim().replace(/两/g, '二')
  if (!text) return Number.NaN
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text)
  if (text === '半') return 0.5

  if (text.includes('点')) {
    const [left, right] = text.split('点')
    const leftNum = parseChineseNumber(left)
    if (!Number.isFinite(leftNum)) return Number.NaN
    const rightDigits = [...right].map((char) => CN_DIGITS[char]).filter((value) => Number.isFinite(value))
    if (!rightDigits.length) return Number.NaN
    return Number(`${leftNum}.${rightDigits.join('')}`)
  }

  if (text === '十') return 10
  if (text.startsWith('十')) return 10 + (CN_DIGITS[text[1]] ?? 0)
  if (text.includes('十')) {
    const [left, right] = text.split('十')
    const leftNum = CN_DIGITS[left] ?? Number.NaN
    const rightNum = right ? (CN_DIGITS[right] ?? Number.NaN) : 0
    if (!Number.isFinite(leftNum) || !Number.isFinite(rightNum)) return Number.NaN
    return leftNum * 10 + rightNum
  }

  if (text.length === 1 && Number.isFinite(CN_DIGITS[text])) return CN_DIGITS[text]
  return Number.NaN
}

function parseRatioToken(token = '') {
  const text = String(token).trim().replace(/\s+/g, '')
  if (!text) return null
  if (/(腰斩|减半|对折)/.test(text)) return 0.5

  const percentMatch = text.match(/^(\d+(?:\.\d+)?)%$/)
  if (percentMatch) return clamp(Number(percentMatch[1]) / 100, 0, 0.99)

  if (text.includes('成')) {
    const normalized = text.replace(/两/g, '二')
    const match = normalized.match(/^([零一二三四五六七八九十半\d.]+)成([零一二三四五六七八九十半\d.]*)$/)
    if (match) {
      const main = parseChineseNumber(match[1])
      if (!Number.isFinite(main)) return null
      let ratio = main / 10
      const tail = match[2]
      if (tail === '半') {
        ratio += 0.05
      } else if (tail) {
        const tailNum = parseChineseNumber(tail)
        if (Number.isFinite(tailNum)) ratio += tailNum / 100
      }
      return clamp(ratio, 0, 0.99)
    }
  }

  const numeric = parseChineseNumber(text)
  if (!Number.isFinite(numeric)) return null
  if (numeric <= 1) return clamp(numeric, 0, 0.99)
  if (numeric <= 100) return clamp(numeric / 100, 0, 0.99)
  return null
}

function splitPromptClauses(text = '') {
  return String(text)
    .split(/[，。,；;！!？?\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function extractReductionFromClause(clause) {
  if (!clause) return null
  if (/(腰斩|减半|对折)/.test(clause)) {
    return { reduction: 0.5, sourceLabel: RegExp.$1 }
  }

  const remainMatch = clause.match(/(?:只剩|仅剩|剩余|剩下|保留|维持在|降到)\s*([0-9.]+%?|[零一二三四五六七八九十两半点]+成?[半零一二三四五六七八九十两点\d.]*)/)
  if (remainMatch) {
    const remainRatio = parseRatioToken(remainMatch[1])
    if (remainRatio != null) {
      return { reduction: clamp(1 - remainRatio, 0, 0.99), sourceLabel: remainMatch[0] }
    }
  }

  const reductionMatch = clause.match(/(?:下降|减少|降低|下调|下跌|削减|压降|缩减|跌幅|降幅)\s*(?:约|大约|近|接近|了|至|到)?\s*([0-9.]+%?|[零一二三四五六七八九十两半点]+成?[半零一二三四五六七八九十两点\d.]*)/)
  if (reductionMatch) {
    const ratio = parseRatioToken(reductionMatch[1])
    if (ratio != null) {
      return { reduction: clamp(ratio, 0, 0.99), sourceLabel: reductionMatch[0] }
    }
  }

  return null
}

function extractReduction(text, subjectRegex) {
  const clauses = splitPromptClauses(text)
  for (const clause of clauses) {
    if (!subjectRegex.test(clause)) continue
    const hit = extractReductionFromClause(clause)
    if (hit) return hit
  }

  const fullTextHit = extractReductionFromClause(String(text))
  if (fullTextHit && subjectRegex.test(String(text))) return fullTextHit
  return null
}

function buildParameterSummary(spec) {
  const parts = []
  if (spec.gridReduction > 0) parts.push(`电网购电 -${Math.round(spec.gridReduction * 100)}%`)
  if (spec.pvReduction > 0) parts.push(`光伏 -${Math.round(spec.pvReduction * 100)}%`)
  parts.push(`响应窗口 ${spec.durationHours || WINDOW_HOURS}h`)
  return parts.join(' / ')
}

function buildEventTitle({ hasTyphoon, hasGridFault, hasPvDrop }) {
  if (hasTyphoon && hasGridFault) return '台风电网受限应急预案'
  if (hasTyphoon) return '台风天气应急预案'
  if (hasGridFault) return '电网受限应急预案'
  if (hasPvDrop) return '光伏突降应急预案'
  return '应急调度预案'
}

function parsePromptToEventSpec(prompt = '') {
  const text = String(prompt).trim()
  const affectedModules = new Set()
  const hasTyphoon = /台风|暴雨|恶劣天气|强对流|极端天气/.test(text)
  const hasGridFault = /电网.*故障|购电.*下降|电网.*下降|限电|电网受限|外部供电受限|购电只剩/.test(text)
  const hasPvDrop = /光伏.*下降|光伏.*突降|光照.*下降|辐照.*下降|云层|光伏腰斩/.test(text)
  const hasPriceSurge = /电价.*飙升|价格.*飙升|现货.*高|电价.*上涨/.test(text)
  const hasCarbonSurge = /碳因子.*高|碳排.*高|高碳|碳价.*高/.test(text)

  const spec = {
    type: 'grid_fault_or_limit',
    title: buildEventTitle({ hasTyphoon, hasGridFault, hasPvDrop }),
    severity: 'critical',
    startHour: new Date().getHours(),
    durationHours: WINDOW_HOURS,
    pvReduction: 0,
    gridReduction: 0,
    priceMultiplier: hasPriceSurge ? 1.45 : 1,
    carbonMultiplier: hasCarbonSurge ? 1.3 : 1,
    weatherNote: '',
    affectedModules: [],
    rawPrompt: text,
    parameterSource: {
      gridReduction: 'none',
      pvReduction: 'none',
    },
    parameterSummary: '',
  }

  if (hasTyphoon) {
    spec.type = 'typhoon_weather'
    spec.weatherNote = '天气恶化导致外部供能与光伏出力同步受损'
    affectedModules.add('grid')
    affectedModules.add('pv')
  }

  if (hasGridFault) {
    spec.type = hasTyphoon ? 'typhoon_weather' : 'grid_fault_or_limit'
    affectedModules.add('grid')
    affectedModules.add('gm')
    affectedModules.add('pem')
    affectedModules.add('es')
    affectedModules.add('ca')
  }

  if (hasPvDrop) {
    if (!hasTyphoon && !hasGridFault) spec.type = 'pv_drop'
    affectedModules.add('pv')
  }

  if (hasPriceSurge) affectedModules.add('market')
  if (hasCarbonSurge) affectedModules.add('carbon')

  const gridReductionHit = extractReduction(text, GRID_SUBJECT_RE)
  const pvReductionHit = extractReduction(text, PV_SUBJECT_RE)

  if (gridReductionHit) {
    spec.gridReduction = clamp(gridReductionHit.reduction, 0, 0.98)
    spec.parameterSource.gridReduction = 'user'
  } else if (hasGridFault) {
    spec.gridReduction = 0.55
    spec.parameterSource.gridReduction = 'template'
  }

  if (pvReductionHit) {
    spec.pvReduction = clamp(pvReductionHit.reduction, 0, 0.95)
    spec.parameterSource.pvReduction = 'user'
  } else if (hasTyphoon) {
    spec.pvReduction = 0.45
    spec.parameterSource.pvReduction = 'template'
  } else if (hasPvDrop) {
    spec.pvReduction = 0.4
    spec.parameterSource.pvReduction = 'template'
  }

  spec.affectedModules = [...affectedModules]
  spec.parameterSummary = buildParameterSummary(spec)
  return spec
}

function normalizeEventSpec(input, prompt = '') {
  const base = parsePromptToEventSpec(prompt)
  const spec = {
    ...base,
    ...(input || {}),
    parameterSource: {
      ...(base.parameterSource || {}),
      ...(input?.parameterSource || {}),
    },
  }

  spec.title = spec.title || base.title
  spec.type = spec.type || base.type
  spec.severity = spec.severity || 'critical'
  spec.startHour = clamp(toNumber(spec.startHour, base.startHour), 0, 23)
  spec.durationHours = WINDOW_HOURS
  spec.presentationMode = String(spec.presentationMode || base.presentationMode || 'dramatic')
  spec.priceMultiplier = Math.max(1, toNumber(spec.priceMultiplier, base.priceMultiplier))
  spec.carbonMultiplier = Math.max(1, toNumber(spec.carbonMultiplier, base.carbonMultiplier))
  spec.weatherNote = String(spec.weatherNote || base.weatherNote || '')
  spec.affectedModules = Array.isArray(spec.affectedModules) && spec.affectedModules.length
    ? [...new Set(spec.affectedModules)]
    : base.affectedModules
  spec.rawPrompt = String(spec.rawPrompt || prompt || '')

  if (input?.gridReduction != null && Number.isFinite(Number(input.gridReduction))) {
    spec.gridReduction = clamp(Number(input.gridReduction), 0, 0.98)
    spec.parameterSource.gridReduction = 'user'
  } else {
    spec.gridReduction = clamp(toNumber(spec.gridReduction, base.gridReduction), 0, 0.98)
  }

  if (input?.pvReduction != null && Number.isFinite(Number(input.pvReduction))) {
    spec.pvReduction = clamp(Number(input.pvReduction), 0, 0.95)
    spec.parameterSource.pvReduction = 'user'
  } else {
    spec.pvReduction = clamp(toNumber(spec.pvReduction, base.pvReduction), 0, 0.95)
  }

  spec.parameterSummary = String(spec.parameterSummary || buildParameterSummary(spec))
  return spec
}

function buildFallbackOutline(spec, reason = '') {
  const priorityOrder = ['P_G', 'P_PV', 'P_es_es', 'P_PEM', 'P_GM', 'P_CA']
  const keyAnchors = [
    spec.gridReduction > 0
      ? '电网购电先按明确降幅封顶，避免“受限却反升”的不合理结果'
      : '电网维持基线兜底供能',
    spec.pvReduction > 0
      ? '光伏按事件强度直接降额，不再沿用正常天气出力'
      : '光伏维持基线出力',
    '储能、PEM、燃机按边界顺序补缺口，优先保供关键负荷',
    '若外部供能受损且内部补偿不足，则联动下调电解槽负荷直至缺口闭合',
  ]
  const explanationBase = spec.type === 'typhoon_weather'
    ? 'LLM 生成失败，已切换为规则模板兜底方案。'
    : '未能获得可通过校验的 LLM 方案，已切换为规则模板兜底方案。'
  const explanation = reason
    ? `${explanationBase} 失败原因：${reason}。该结果仅用于兜底展示，不代表 LLM 生成。`
    : `${explanationBase} 当前结果为非 LLM 生成，仅作为应急演示兜底。`

  return { priorityOrder, keyAnchors, explanation, degraded: true }
}

async function planEmergencyDispatch(spec, context, planner, contextPackage, feedbackIssues = [], attempt = 0) {
  if (!planner) throw new Error('planner_unavailable')
  return planner({
    spec,
    prompt: spec.rawPrompt || spec.title,
    baselineSummary: context.baselineDataset?.summary ?? {},
    activeStrategy: context.activeStrategy,
    baselineWindow: buildBaselineWindow(context.baselineDataset, context.activeStrategy, spec.startHour, context.viewDate),
    contextPackage,
    feedbackIssues,
    attempt,
  })
}

function readRealtimeSnapshot(viewDate) {
  const db = getDb()
  const rows = db.prepare(
    'SELECT hour, price_grid, ef_grid, shortwave_radiation, temperature, wind_speed_10m, wind_speed_80m FROM realtime_data WHERE data_date = ? ORDER BY hour'
  ).all(viewDate)
  const prices = Array.from({ length: 24 }, () => 0.62)
  const carbon = Array.from({ length: 24 }, () => 0.00058)
  const radiation = Array.from({ length: 24 }, () => 0)
  const temperature = Array.from({ length: 24 }, () => 25)
  const windSpeed = Array.from({ length: 24 }, () => 0)
  for (const row of rows) {
    prices[row.hour] = toNumber(row.price_grid, prices[row.hour])
    carbon[row.hour] = toNumber(row.ef_grid, carbon[row.hour])
    radiation[row.hour] = toNumber(row.shortwave_radiation, radiation[row.hour])
    temperature[row.hour] = toNumber(row.temperature, temperature[row.hour])
    windSpeed[row.hour] = toNumber(row.wind_speed_80m, toNumber(row.wind_speed_10m, windSpeed[row.hour]))
  }
  return { prices, carbon, radiation, temperature, windSpeed }
}

function applyRamp(target, previous, rampPerStep, maxCap) {
  const low = Math.max(0, previous - rampPerStep)
  const high = Math.min(maxCap, previous + rampPerStep)
  return clamp(target, low, high)
}

function makeTimeLabel(viewDate, startHour, stepIndex) {
  const totalMinutes = startHour * 60 + stepIndex * STEP_MINUTES
  const hour = Math.floor(totalMinutes / 60) % 24
  const minute = totalMinutes % 60
  const label = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return {
    label,
    timestamp: `${viewDate || getBeijingDate()} ${label}:00`,
  }
}

function buildBaselineWindow(baselineDataset, activeStrategy, startHour, viewDate) {
  const series = {
    P_CA: interpolateHourlyWindow(baselineDataset.P_CA?.[activeStrategy], startHour),
    P_PV: interpolateHourlyWindow(baselineDataset.P_PV?.[activeStrategy], startHour),
    P_GM: interpolateHourlyWindow(baselineDataset.P_GM?.[activeStrategy], startHour),
    P_PEM: interpolateHourlyWindow(baselineDataset.P_PEM?.[activeStrategy], startHour),
    P_G: interpolateHourlyWindow(baselineDataset.P_G?.[activeStrategy], startHour),
    P_es_es: interpolateHourlyWindow(baselineDataset.P_es_es, startHour),
  }
  const labels = []
  const points = []
  for (let i = 0; i < STEPS; i += 1) {
    const time = makeTimeLabel(viewDate, startHour, i)
    const supplyTotal = round(series.P_PV[i] + series.P_G[i] + series.P_es_es[i] + series.P_PEM[i] + series.P_GM[i], 4)
    labels.push(time.label)
    points.push({
      index: i,
      label: time.label,
      timestamp: time.timestamp,
      P_CA: round(series.P_CA[i], 4),
      P_PV: round(series.P_PV[i], 4),
      P_GM: round(series.P_GM[i], 4),
      P_PEM: round(series.P_PEM[i], 4),
      P_G: round(series.P_G[i], 4),
      P_es_es: round(series.P_es_es[i], 4),
      supplyTotal,
      gap: round(Math.max(0, series.P_CA[i] - supplyTotal), 4),
      riskLevel: 'low',
    })
  }
  return { labels, series, points }
}

function metricFromSupportToken(token) {
  const value = String(token || '').trim().toLowerCase()
  if (!value) return null
  if (['p_gm', 'gm', '燃机', '燃氣輪機', 'gas_turbine'].includes(value)) return 'P_GM'
  if (['p_pem', 'pem', 'fuel_cell', '燃料电池'].includes(value)) return 'P_PEM'
  if (['p_es_es', 'storage', 'es', '储能', 'battery'].includes(value)) return 'P_es_es'
  return null
}

function buildDefaultStagePlan(spec) {
  return [
    {
      phase: 'trigger',
      title: '冲击触发',
      objective: '快速压降外部供能，建立事故态边界',
      startIndex: 0,
      endIndex: 2,
      gridReductionFactor: 1.1,
      pvReductionFactor: 1.05,
      caReductionFactor: 0.88,
      supportLiftFactor: 0.45,
    },
    {
      phase: 'response',
      title: '内部支撑抬升',
      objective: '燃机、PEM、储能快速抬升并接管缺口',
      startIndex: 3,
      endIndex: 8,
      gridReductionFactor: 1.05,
      pvReductionFactor: 1.02,
      caReductionFactor: 1,
      supportLiftFactor: 1,
    },
    {
      phase: 'stabilize',
      title: '负荷重分配',
      objective: '维持高冲击联动并稳定保供',
      startIndex: 9,
      endIndex: 35,
      gridReductionFactor: 0.98,
      pvReductionFactor: 1,
      caReductionFactor: 1.08,
      supportLiftFactor: 1.15,
    },
    {
      phase: 'reserve',
      title: '保供收束',
      objective: '维持应急冗余并准备继续执行或回退',
      startIndex: 36,
      endIndex: 47,
      gridReductionFactor: 0.96,
      pvReductionFactor: 0.97,
      caReductionFactor: 1.02,
      supportLiftFactor: 0.95,
    },
  ]
}

function normalizeStagePlan(stagePlan, labels, spec) {
  const defaults = buildDefaultStagePlan(spec)
  const source = Array.isArray(stagePlan) && stagePlan.length === 4 ? stagePlan : defaults
  return source.map((raw, index) => {
    const fallback = defaults[index]
    const startIndex = clamp(toNumber(raw?.startIndex, fallback.startIndex), 0, STEPS - 1)
    const endIndex = clamp(toNumber(raw?.endIndex, fallback.endIndex), startIndex, STEPS - 1)
    return {
      phase: String(raw?.phase || fallback.phase),
      title: String(raw?.title || fallback.title),
      objective: String(raw?.objective || fallback.objective),
      startIndex,
      endIndex,
      startLabel: labels[startIndex] || labels[0],
      endLabel: labels[endIndex] || labels[labels.length - 1],
      gridReductionFactor: clamp(toNumber(raw?.gridReductionFactor, fallback.gridReductionFactor), 0.6, 1.2),
      pvReductionFactor: clamp(toNumber(raw?.pvReductionFactor, fallback.pvReductionFactor), 0.6, 1.2),
      caReductionFactor: clamp(toNumber(raw?.caReductionFactor, fallback.caReductionFactor), 0.65, 1.25),
      supportLiftFactor: clamp(toNumber(raw?.supportLiftFactor, fallback.supportLiftFactor), 0.25, 1.35),
    }
  })
}

function stageForIndex(stagePlan, index) {
  return stagePlan.find((stage) => index >= stage.startIndex && index <= stage.endIndex) || stagePlan[stagePlan.length - 1]
}

function buildEmergencyContextPackage(context, spec) {
  const { baselineDataset, activeStrategy, viewDate } = context
  const baselineWindow = buildBaselineWindow(baselineDataset, activeStrategy, spec.startHour, viewDate)
  const realtime = readRealtimeSnapshot(viewDate)
  const snapshotHour = clamp(spec.startHour, 0, 23)
  const snapshotTime = makeTimeLabel(viewDate, spec.startHour, 0).timestamp
  const baseGM = baselineWindow.series.P_GM
  const basePEM = baselineWindow.series.P_PEM
  const baseES = baselineWindow.series.P_es_es.map((value) => Math.max(0, value))
  const bounds = {
    P_CA: { min: 0, max: round(Math.max(maxValue(baselineWindow.series.P_CA), 3200) * 1.02, 2), ramp: RAMP_LIMITS.P_CA },
    P_PV: { min: 0, max: round(Math.max(maxValue(baselineWindow.series.P_PV), 320), 2), ramp: RAMP_LIMITS.P_PV },
    P_GM: { min: 0, max: round(Math.max(maxValue(baseGM), average(baseGM), 420) * 1.9, 2), ramp: RAMP_LIMITS.P_GM },
    P_PEM: { min: 0, max: round(Math.max(maxValue(basePEM), average(basePEM), 280) * 1.85, 2), ramp: RAMP_LIMITS.P_PEM },
    P_G: { min: 0, max: round(Math.max(maxValue(baselineWindow.series.P_G), 1200) * 1.02, 2), ramp: RAMP_LIMITS.P_G },
    P_es_es: { min: 0, max: round(Math.max(maxValue(baseES), 260) * 1.9, 2), ramp: RAMP_LIMITS.P_es_es },
  }
  const labels = baselineWindow.labels
  return {
    activeStrategy,
    viewDate,
    snapshotAt: baselineDataset?._meta?.snapshotAt || formatBeijingDateTime(),
    baselineWindow,
    currentSnapshot: {
      activeStrategy,
      snapshotHour,
      timestamp: snapshotTime,
      snapshotAt: baselineDataset?._meta?.snapshotAt || formatBeijingDateTime(),
      devices: {
        P_CA: round(safeAt(baselineDataset.P_CA?.[activeStrategy], snapshotHour, baselineWindow.series.P_CA[0]), 4),
        P_PV: round(safeAt(baselineDataset.P_PV?.[activeStrategy], snapshotHour, baselineWindow.series.P_PV[0]), 4),
        P_GM: round(safeAt(baselineDataset.P_GM?.[activeStrategy], snapshotHour, baselineWindow.series.P_GM[0]), 4),
        P_PEM: round(safeAt(baselineDataset.P_PEM?.[activeStrategy], snapshotHour, baselineWindow.series.P_PEM[0]), 4),
        P_G: round(safeAt(baselineDataset.P_G?.[activeStrategy], snapshotHour, baselineWindow.series.P_G[0]), 4),
        P_es_es: round(safeAt(baselineDataset.P_es_es, snapshotHour, baselineWindow.series.P_es_es[0]), 4),
        H_HS: round(safeAt(baselineDataset.H_HS?.[activeStrategy], snapshotHour, 0), 4),
      },
      external: {
        price_grid: round(safeAt(realtime.prices, snapshotHour, 0.62), 4),
        ef_grid: round(safeAt(realtime.carbon, snapshotHour, 0.00058), 6),
        shortwave_radiation: round(safeAt(realtime.radiation, snapshotHour, 0), 2),
        temperature: round(safeAt(realtime.temperature, snapshotHour, 25), 2),
        wind_speed: round(safeAt(realtime.windSpeed, snapshotHour, 0), 2),
      },
      bounds,
    },
    externalWindow: {
      price_grid: interpolateHourlyWindow(realtime.prices, spec.startHour),
      ef_grid: interpolateHourlyWindow(realtime.carbon, spec.startHour),
      shortwave_radiation: interpolateHourlyWindow(realtime.radiation, spec.startHour),
      temperature: interpolateHourlyWindow(realtime.temperature, spec.startHour),
      wind_speed: interpolateHourlyWindow(realtime.windSpeed, spec.startHour),
    },
    bounds,
    rampLimits: RAMP_LIMITS,
  }
}

function buildDefaultDispatchIntent(contextPackage, spec) {
  const base = contextPackage.baselineWindow
  const gridReductionTarget = clamp(spec.gridReduction || 0.55, 0, 0.98)
  const pvReductionTarget = clamp(spec.pvReduction || (spec.type === 'typhoon_weather' ? 0.45 : 0.32), 0, 0.95)
  const caReductionTarget = clamp(0.18 + gridReductionTarget * 0.45 + pvReductionTarget * 0.28 + (spec.severity === 'critical' ? 0.05 : 0), 0.22, 0.68)
  const gmLiftTarget = clamp(0.28 + gridReductionTarget * 0.7 + pvReductionTarget * 0.2, 0.35, 1.3)
  const pemLiftTarget = clamp(0.24 + gridReductionTarget * 0.38 + pvReductionTarget * 0.4, 0.28, 1.2)
  const storageLiftTarget = clamp(0.35 + gridReductionTarget * 0.48 + pvReductionTarget * 0.28, 0.4, 1.4)
  return {
    eventAssessment: 'Severe external supply disturbance with coordinated internal support required.',
    targetAdjustments: {
      gridReductionTarget,
      pvReductionTarget,
      caReductionTarget,
      gmLiftTarget,
      pemLiftTarget,
      storageLiftTarget,
    },
    supportPriority: ['P_GM', 'P_es_es', 'P_PEM'],
    stagePlan: normalizeStagePlan([], base.labels, spec),
    dispatchPrinciples: [
      'Enforce requested external reduction exactly.',
      'Drop electrolyzer load visibly when external supply is constrained.',
      'Lift gas turbine, PEM and storage together to form a clear coordinated response.',
      'Keep the emergency curve dramatic while preserving supply-demand closure.',
    ],
    explanation: 'Emergency intent synthesized from current park snapshot, baseline window and live external signals.',
  }
}

function buildFallbackIntent(spec, contextPackage, reason = '') {
  const defaults = buildDefaultDispatchIntent(contextPackage, spec)
  return {
    eventAssessment: 'LLM generation failed, deterministic dramatic fallback intent applied.',
    targetAdjustments: defaults.targetAdjustments,
    supportPriority: defaults.supportPriority,
    stagePlan: defaults.stagePlan,
    dispatchPrinciples: [
      'Strictly honor the user-provided reduction target.',
      'Reduce electrolyzer load visibly when external supply is damaged.',
      'Lift GM, PEM and storage together to keep the emergency response obvious.',
      'Use fallback intent only as a deterministic backup for the command cockpit.',
    ],
    timeline: [],
    moduleStatus: [],
    riskHints: ['fallback_intent', 'dramatic_backup'],
    explanation: reason
      ? `LLM generation failed and the system switched to deterministic dramatic fallback. Reason: ${reason}.`
      : 'LLM generation failed and the system switched to deterministic dramatic fallback.',
  }
}

function normalizeDispatchIntent(plan, contextPackage, spec) {
  const defaults = buildDefaultDispatchIntent(contextPackage, spec)
  const source = plan && typeof plan === 'object' ? plan : {}
  const targetSource = source.targetAdjustments && typeof source.targetAdjustments === 'object' ? source.targetAdjustments : {}
  const supportPriority = Array.isArray(source.supportPriority)
    ? source.supportPriority.map(metricFromSupportToken).filter(Boolean)
    : defaults.supportPriority
  const targetAdjustments = {
    gridReductionTarget: clamp(toNumber(targetSource.gridReductionTarget, defaults.targetAdjustments.gridReductionTarget), Math.max(spec.gridReduction || 0, 0), 0.98),
    pvReductionTarget: clamp(toNumber(targetSource.pvReductionTarget, defaults.targetAdjustments.pvReductionTarget), Math.max(spec.pvReduction || 0, 0), 0.95),
    caReductionTarget: clamp(toNumber(targetSource.caReductionTarget, defaults.targetAdjustments.caReductionTarget), defaults.targetAdjustments.caReductionTarget * 0.9, 0.72),
    gmLiftTarget: clamp(toNumber(targetSource.gmLiftTarget, defaults.targetAdjustments.gmLiftTarget), 0.2, 1.4),
    pemLiftTarget: clamp(toNumber(targetSource.pemLiftTarget, defaults.targetAdjustments.pemLiftTarget), 0.18, 1.3),
    storageLiftTarget: clamp(toNumber(targetSource.storageLiftTarget, defaults.targetAdjustments.storageLiftTarget), 0.22, 1.5),
  }
  return {
    eventAssessment: String(source.eventAssessment || defaults.eventAssessment),
    targetAdjustments,
    supportPriority: supportPriority.length ? supportPriority : defaults.supportPriority,
    stagePlan: normalizeStagePlan(source.stagePlan, contextPackage.baselineWindow.labels, spec),
    dispatchPrinciples: Array.isArray(source.dispatchPrinciples) && source.dispatchPrinciples.length
      ? source.dispatchPrinciples.map((item) => String(item))
      : defaults.dispatchPrinciples,
    timeline: Array.isArray(source.timeline) ? source.timeline : [],
    moduleStatus: Array.isArray(source.moduleStatus) ? source.moduleStatus : [],
    riskHints: Array.isArray(source.riskHints) ? source.riskHints.map((item) => String(item)) : [],
    explanation: String(source.explanation || defaults.explanation),
  }
}

function buildSeriesFromPoints(points) {
  return {
    P_CA: points.map((point) => round(point.P_CA, 4)),
    P_PV: points.map((point) => round(point.P_PV, 4)),
    P_GM: points.map((point) => round(point.P_GM, 4)),
    P_PEM: points.map((point) => round(point.P_PEM, 4)),
    P_G: points.map((point) => round(point.P_G, 4)),
    P_es_es: points.map((point) => round(point.P_es_es, 4)),
    gap: points.map((point) => round(point.gap, 4)),
  }
}

function buildRiskLevel(gap, demand) {
  const ratio = demand > 0 ? gap / demand : 0
  if (gap > 220 || ratio > 0.12) return 'high'
  if (gap > 60 || ratio > 0.04) return 'medium'
  return 'low'
}

function normalizePlannerPoint(rawPoint, baselinePoint, index) {
  const point = {
    index,
    label: baselinePoint.label,
    timestamp: baselinePoint.timestamp,
    P_CA: round(Math.max(0, toNumber(rawPoint?.P_CA, baselinePoint.P_CA)), 4),
    P_PV: round(Math.max(0, toNumber(rawPoint?.P_PV, baselinePoint.P_PV)), 4),
    P_GM: round(Math.max(0, toNumber(rawPoint?.P_GM, baselinePoint.P_GM)), 4),
    P_PEM: round(Math.max(0, toNumber(rawPoint?.P_PEM, baselinePoint.P_PEM)), 4),
    P_G: round(Math.max(0, toNumber(rawPoint?.P_G, baselinePoint.P_G)), 4),
    P_es_es: round(Math.max(0, toNumber(rawPoint?.P_es_es, Math.max(0, baselinePoint.P_es_es))), 4),
  }
  point.supplyTotal = round(point.P_PV + point.P_G + point.P_es_es + point.P_PEM + point.P_GM, 4)
  point.gap = round(Math.max(0, point.P_CA - point.supplyTotal), 4)
  point.riskLevel = rawPoint?.riskLevel || buildRiskLevel(point.gap, point.P_CA)
  return point
}

function resampleSequence(values, targetLength) {
  if (!Array.isArray(values) || values.length === 0) return Array.from({ length: targetLength }, () => null)
  if (values.length === targetLength) return values.slice()
  if (values.length === 1) return Array.from({ length: targetLength }, () => values[0])

  return Array.from({ length: targetLength }, (_, index) => {
    const pos = (index * (values.length - 1)) / Math.max(targetLength - 1, 1)
    const left = Math.floor(pos)
    const right = Math.min(left + 1, values.length - 1)
    const frac = pos - left
    const leftValue = values[left]
    const rightValue = values[right]
    if (leftValue == null && rightValue == null) return null
    if (leftValue == null) return rightValue
    if (rightValue == null) return leftValue
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return leftValue + (rightValue - leftValue) * frac
    }
    return frac < 0.5 ? leftValue : rightValue
  })
}

function extractPlannerPoints(plan, baselineWindow) {
  if (Array.isArray(plan?.points) && plan.points.length > 0) {
    return resampleSequence(plan.points, STEPS)
  }

  const seriesSource = plan?.series || {}
  const keys = ['P_CA', 'P_PV', 'P_GM', 'P_PEM', 'P_G', 'P_es_es']
  const hasSeries = keys.some((key) => Array.isArray(seriesSource?.[key]) && seriesSource[key].length > 0)
  if (!hasSeries) return baselineWindow.points.map(() => null)

  const rebuiltSeries = Object.fromEntries(keys.map((key) => [
    key,
    resampleSequence(Array.isArray(seriesSource?.[key]) ? seriesSource[key] : [], STEPS),
  ]))

  return Array.from({ length: STEPS }, (_, index) => ({
    P_CA: rebuiltSeries.P_CA[index],
    P_PV: rebuiltSeries.P_PV[index],
    P_GM: rebuiltSeries.P_GM[index],
    P_PEM: rebuiltSeries.P_PEM[index],
    P_G: rebuiltSeries.P_G[index],
    P_es_es: rebuiltSeries.P_es_es[index],
  }))
}

function repairDetailAgainstConstraints(detail, context, spec) {
  const baselineWindow = buildBaselineWindow(context.baselineDataset, context.activeStrategy, spec.startHour, context.viewDate)
  const gmCap = Math.max(maxValue(baselineWindow.series.P_GM), average(baselineWindow.series.P_GM), 260) * 1.45
  const pemCap = Math.max(maxValue(baselineWindow.series.P_PEM), average(baselineWindow.series.P_PEM), 180) * 1.45
  const esCap = Math.max(maxValue(baselineWindow.series.P_es_es.map((value) => Math.abs(value))), 220) * 1.35
  let prev = null

  const repairedPoints = detail.points.map((point, index) => {
    const base = baselineWindow.points[index]
    const next = { ...point }

    if (spec.gridReduction > 0) {
      const gridCap = base.P_G * (1 - spec.gridReduction)
      next.P_G = round(Math.min(next.P_G, gridCap), 4)
    }
    if (spec.pvReduction > 0) {
      const pvCap = base.P_PV * (1 - spec.pvReduction)
      next.P_PV = round(Math.min(next.P_PV, pvCap), 4)
    }

    const externalLoss = Math.max(0, base.P_G - next.P_G) + Math.max(0, base.P_PV - next.P_PV)
    if (externalLoss > 1) {
      const demandCap = base.P_CA * Math.max(0.52, 1 - spec.gridReduction * 0.55 - spec.pvReduction * 0.28)
      next.P_CA = round(Math.min(next.P_CA, base.P_CA, demandCap), 4)
    } else {
      next.P_CA = round(Math.min(next.P_CA, base.P_CA), 4)
    }

    next.P_GM = round(clamp(next.P_GM, 0, gmCap), 4)
    next.P_PEM = round(clamp(next.P_PEM, 0, pemCap), 4)
    next.P_es_es = round(clamp(next.P_es_es, 0, esCap), 4)

    let supplyTotal = next.P_PV + next.P_G + next.P_es_es + next.P_PEM + next.P_GM
    let shortage = Math.max(0, next.P_CA - supplyTotal)
    if (shortage > 0) {
      const esAdd = Math.min(shortage, Math.max(0, esCap - next.P_es_es))
      next.P_es_es = round(next.P_es_es + esAdd, 4)
      shortage -= esAdd
    }
    if (shortage > 0) {
      const pemAdd = Math.min(shortage, Math.max(0, pemCap - next.P_PEM))
      next.P_PEM = round(next.P_PEM + pemAdd, 4)
      shortage -= pemAdd
    }
    if (shortage > 0) {
      const gmAdd = Math.min(shortage, Math.max(0, gmCap - next.P_GM))
      next.P_GM = round(next.P_GM + gmAdd, 4)
      shortage -= gmAdd
    }

    supplyTotal = next.P_PV + next.P_G + next.P_es_es + next.P_PEM + next.P_GM
    if (next.P_CA > supplyTotal) {
      next.P_CA = round(Math.min(next.P_CA, supplyTotal), 4)
    }

    if (prev) {
      for (const metric of METRIC_ORDER) {
        const delta = next[metric] - prev[metric]
        const limit = RAMP_LIMITS[metric]
        if (Math.abs(delta) > limit) {
          next[metric] = round(prev[metric] + Math.sign(delta) * limit, 4)
        }
      }
      if ((spec.gridReduction > 0 || spec.pvReduction > 0) && next.P_CA > base.P_CA) {
        next.P_CA = round(base.P_CA, 4)
      }
    }

    next.supplyTotal = round(next.P_PV + next.P_G + next.P_es_es + next.P_PEM + next.P_GM, 4)
    next.gap = round(Math.max(0, next.P_CA - next.supplyTotal), 4)
    next.riskLevel = buildRiskLevel(next.gap, next.P_CA)
    prev = next
    return next
  })

  detail.points = repairedPoints
  detail.series = buildSeriesFromPoints(repairedPoints)
  detail.meta = {
    ...(detail.meta || {}),
    plannerPointCount: detail.meta?.plannerPointCount ?? repairedPoints.length,
    repairedByValidator: true,
  }
  return detail
}

function buildTimeline(points, spec, timeline = []) {
  if (Array.isArray(timeline) && timeline.length) {
    return timeline.slice(0, 8).map((item, index) => ({
      time: String(item.time || points[Math.min(index * 12, points.length - 1)]?.label || '--:--'),
      title: String(item.title || `动作 ${index + 1}`),
      detail: String(item.detail || item.action || '按预案调整设备联动'),
      severity: String(item.severity || 'warning'),
      action: item.action ? String(item.action) : undefined,
    }))
  }
  const peakGapPoint = [...points].sort((a, b) => b.gap - a.gap)[0] || points[0]
  const peakSupportPoint = [...points].sort((a, b) => (b.P_GM + b.P_PEM + b.P_es_es) - (a.P_GM + a.P_PEM + a.P_es_es))[0] || points[0]
  return [
    {
      time: points[0]?.label || '--:--',
      title: '事件确认',
      detail: `${spec.title} 已进入 ${WINDOW_HOURS} 小时应急编排窗口，开始压降外部供能依赖。`,
      severity: spec.severity || 'critical',
      action: '锁定电网与光伏降额边界',
    },
    {
      time: peakSupportPoint?.label || '--:--',
      title: '内部支撑抬升',
      detail: `燃机、PEM、储能在 ${peakSupportPoint?.label || '--:--'} 附近承担最大补偿任务。`,
      severity: 'warning',
      action: '提升内部支撑出力并控制爬坡',
    },
    {
      time: peakGapPoint?.label || '--:--',
      title: '缺口压制',
      detail: `在 ${peakGapPoint?.label || '--:--'} 识别到最大供能缺口，联动下调电解槽负荷。`,
      severity: peakGapPoint?.gap > 120 ? 'critical' : 'warning',
      action: '压降柔性负荷，闭合供需缺口',
    },
    {
      time: points[points.length - 1]?.label || '--:--',
      title: '窗口收束',
      detail: '4 小时应急窗口末端进入收束阶段，保留后续回退或二次编排空间。',
      severity: 'info',
      action: '保持单一应急执行态',
    },
  ]
}

function scoreToRiskLevel(score) {
  if (score >= 72) return 'high'
  if (score >= 42) return 'medium'
  return 'low'
}

function buildRiskMatrix(detail) {
  const windows = Array.from({ length: WINDOW_HOURS }, (_, index) => ({
    label: `${String(index).padStart(2, '0')}:00-${String(index + 1).padStart(2, '0')}:00`,
    start: index * 12,
    end: index * 12 + 12,
  }))
  const moduleSeries = {
    电网: detail.series.P_G,
    光伏: detail.series.P_PV,
    电解槽: detail.series.P_CA,
    燃机: detail.series.P_GM,
    PEM: detail.series.P_PEM,
    储能: detail.series.P_es_es,
  }
  return Object.entries(moduleSeries).flatMap(([module, values]) => windows.map((window) => {
    const slice = values.slice(window.start, window.end)
    const avg = average(slice)
    const peak = maxValue(slice)
    const rawScore = module === '电网'
      ? (avg / 1000) * 18
      : module === '光伏'
        ? (avg / 800) * 16
        : module === '电解槽'
          ? (avg / 1000) * 12
          : module === '燃机'
            ? (peak / 400) * 20
            : module === 'PEM'
              ? (peak / 220) * 22
              : (peak / 240) * 24
    const score = round(clamp(rawScore, 5, 100), 0)
    return {
      module,
      windowLabel: window.label,
      level: scoreToRiskLevel(score),
      score,
      reason: `${module} 在 ${window.label} 承担 ${module === '电解槽' ? '负荷压降' : '应急支撑'}任务`,
    }
  }))
}

function buildModuleStatus(detail) {
  const latestPoint = detail.points[detail.points.length - 1] || detail.points[0]
  return Object.entries(MODULE_LABELS).map(([key, module]) => {
    const riskCells = detail.riskMatrix?.filter((cell) => cell.module === module) || []
    const maxScore = maxValue(riskCells.map((cell) => cell.score), 0)
    const level = maxScore >= 72 ? 'red' : maxScore >= 42 ? 'amber' : 'green'
    return {
      module,
      level,
      title: key === 'P_CA'
        ? '柔性负荷压降'
        : key === 'P_G' || key === 'P_PV'
          ? '受损边界执行'
          : '内部支撑调节',
      detail: level === 'red'
        ? `${module} 当前处于高压支撑或高风险状态`
        : level === 'amber'
          ? `${module} 当前处于承压运行状态`
          : `${module} 当前维持正常/待命状态`,
      suggestion: key === 'P_CA'
        ? '继续压降柔性负荷，避免逆势抬升'
        : key === 'P_G' || key === 'P_PV'
          ? '按事件边界保持降额，不允许反弹'
          : '维持支撑爬坡，避免超调',
      currentValue: round(latestPoint?.[key] ?? 0, 2),
      unit: 'kW',
    }
  })
}

function computeLiftRatio(planValues = [], baseValues = [], floor = 1) {
  const baseAvg = average(baseValues)
  const planAvg = average(planValues)
  if (baseAvg > 0) return clamp(planAvg / baseAvg - 1, 0, 2)
  return clamp(planAvg / Math.max(floor, 1), 0, 2)
}

function computeImpactScore(actualEnvelope = {}) {
  const grid = (actualEnvelope.gridReduction || 0) * 100
  const pv = (actualEnvelope.pvReduction || 0) * 100
  const ca = (actualEnvelope.caReduction || 0) * 100
  const gm = (actualEnvelope.gmLift || 0) * 65
  const pem = (actualEnvelope.pemLift || 0) * 65
  const storage = (actualEnvelope.storageLift || 0) * 65
  return round(clamp(grid * 0.24 + pv * 0.12 + ca * 0.22 + gm * 0.16 + pem * 0.13 + storage * 0.13, 0, 100), 1)
}

function buildTimelineV2(detail, spec) {
  if (Array.isArray(detail.timeline) && detail.timeline.length) {
    return detail.timeline.slice(0, 8).map((item, index) => ({
      time: String(item.time || detail.points[Math.min(index * 12, detail.points.length - 1)]?.label || '--:--'),
      title: String(item.title || `Action ${index + 1}`),
      detail: String(item.detail || item.action || 'Execute emergency device coordination.'),
      severity: String(item.severity || 'warning'),
      action: item.action ? String(item.action) : undefined,
    }))
  }
  if (Array.isArray(detail.stagePlan) && detail.stagePlan.length) {
    return detail.stagePlan.slice(0, 4).map((stage, index) => ({
      time: String(stage.startLabel || detail.points[stage.startIndex || 0]?.label || '--:--'),
      title: String(stage.title || `Phase ${index + 1}`),
      detail: String(stage.objective || 'Execute emergency dispatch stage.'),
      severity: index < 2 ? 'critical' : index === 2 ? 'warning' : 'info',
      action: `${stage.startLabel || '--:--'} -> ${stage.endLabel || '--:--'}`,
    }))
  }
  return buildTimeline(detail.points, spec, [])
}

function buildRiskMatrixV2(detail, spec) {
  const windows = Array.from({ length: WINDOW_HOURS }, (_, index) => ({
    label: `${String(index).padStart(2, '0')}:00-${String(index + 1).padStart(2, '0')}:00`,
    start: index * 12,
    end: index * 12 + 12,
  }))
  const severeDisturbance = (spec.gridReduction || 0) >= 0.4 || (spec.pvReduction || 0) >= 0.25 || spec.type === 'typhoon_weather'
  const moduleSeries = {
    电网: ['P_G', 900],
    光伏: ['P_PV', 320],
    电解槽: ['P_CA', 900],
    燃机: ['P_GM', 280],
    PEM: ['P_PEM', 180],
    储能: ['P_es_es', 180],
  }
  return Object.entries(moduleSeries).flatMap(([module, [metric, floor]]) => windows.map((window) => {
    const values = detail.series?.[metric] || []
    const baseValues = detail.baselineSeries?.[metric] || []
    const slice = values.slice(window.start, window.end)
    const baseSlice = baseValues.slice(window.start, window.end)
    const avgPlan = average(slice)
    const avgBase = average(baseSlice)
    const peakPlan = maxValue(slice)
    const reductionRatio = avgBase > 0 ? clamp(1 - avgPlan / avgBase, 0, 1) : 0
    const liftRatio = avgBase > 0 ? clamp(avgPlan / avgBase - 1, 0, 2) : clamp(avgPlan / Math.max(floor, 1), 0, 2)
    let score
    let reason
    if (metric === 'P_G' || metric === 'P_PV') {
      score = 32 + reductionRatio * 58 + (severeDisturbance ? 10 : 0)
      reason = `${module}在${window.label}承担受损边界。`
    } else if (metric === 'P_CA') {
      const gapSlice = (detail.series?.gap || []).slice(window.start, window.end)
      score = 24 + reductionRatio * 44 + clamp(maxValue(gapSlice) / 120, 0, 1) * 22 + (severeDisturbance ? 8 : 0)
      reason = `${module}在${window.label}执行明显降载。`
    } else {
      score = 18 + liftRatio * 48 + clamp(peakPlan / Math.max(floor, 1), 0, 1.2) * 18 + (severeDisturbance ? 6 : 0)
      reason = `${module}在${window.label}承担内部支撑任务。`
    }
    if (severeDisturbance) score = Math.max(score, metric === 'P_CA' ? 48 : 45)
    const normalizedScore = round(clamp(score, 5, 100), 0)
    return {
      module,
      windowLabel: window.label,
      level: scoreToRiskLevel(normalizedScore),
      score: normalizedScore,
      reason,
    }
  }))
}

function buildModuleStatusV2(detail) {
  const latestPoint = detail.points[detail.points.length - 1] || detail.points[0]
  return Object.entries(MODULE_LABELS).map(([key, module]) => {
    const riskCells = detail.riskMatrix?.filter((cell) => cell.module === module) || []
    const maxScore = maxValue(riskCells.map((cell) => cell.score), 0)
    const level = maxScore >= 72 ? 'red' : maxScore >= 42 ? 'amber' : 'green'
    return {
      module,
      level,
      title: key === 'P_CA'
        ? '柔性负荷下调'
        : key === 'P_G' || key === 'P_PV'
          ? '受损边界执行'
          : '内部支撑抬升',
      detail: level === 'red'
        ? `${module} 当前处于高风险或关键支撑状态。`
        : level === 'amber'
          ? `${module} 当前处于承压运行状态。`
          : `${module} 当前处于正常/待命状态。`,
      suggestion: key === 'P_CA'
        ? '保持明显降载，避免逆势抬升。'
        : key === 'P_G' || key === 'P_PV'
          ? '按事件边界维持降幅，不允许反弹。'
          : '维持高冲击支撑曲线，但避免越限。',
      currentValue: round(latestPoint?.[key] ?? 0, 2),
      unit: 'kW',
    }
  })
}

function enrichDetail(detail, context, spec, generationMode, validationIssues = [], retries = 0) {
  const baselineWindow = buildBaselineWindow(context.baselineDataset, context.activeStrategy, spec.startHour, context.viewDate)
  const actualGridReduction = average(baselineWindow.series.P_G) > 0 ? clamp(1 - average(detail.series.P_G) / average(baselineWindow.series.P_G), 0, 1) : 0
  const actualPvReduction = average(baselineWindow.series.P_PV) > 0 ? clamp(1 - average(detail.series.P_PV) / average(baselineWindow.series.P_PV), 0, 1) : 0
  const actualCaReduction = average(baselineWindow.series.P_CA) > 0 ? clamp(1 - average(detail.series.P_CA) / average(baselineWindow.series.P_CA), 0, 1) : 0
  const actualGmLift = computeLiftRatio(detail.series.P_GM, baselineWindow.series.P_GM, 280)
  const actualPemLift = computeLiftRatio(detail.series.P_PEM, baselineWindow.series.P_PEM, 180)
  const actualStorageLift = computeLiftRatio(detail.series.P_es_es, baselineWindow.series.P_es_es.map((value) => Math.max(0, value)), 180)
  const targetEnvelope = detail.targetEnvelope || {
    gridReduction: round(spec.gridReduction ?? 0, 4),
    pvReduction: round(spec.pvReduction ?? 0, 4),
  }
  const actualEnvelope = {
    gridReduction: round(actualGridReduction, 4),
    pvReduction: round(actualPvReduction, 4),
    caReduction: round(actualCaReduction, 4),
    gmLift: round(actualGmLift, 4),
    pemLift: round(actualPemLift, 4),
    storageLift: round(actualStorageLift, 4),
  }
  const impactScore = computeImpactScore(actualEnvelope)

  detail.baselineSeries = baselineWindow.series
  detail.summary = {
    ...detail.summary,
    peakGrid: round(maxValue(detail.series.P_G), 2),
    peakPEM: round(maxValue(detail.series.P_PEM), 2),
    peakGM: round(maxValue(detail.series.P_GM), 2),
    peakStorage: round(maxValue(detail.series.P_es_es), 2),
    peakCA: round(maxValue(detail.series.P_CA), 2),
    maxGap: round(maxValue(detail.series.gap), 2),
    requestedGridReduction: round(spec.gridReduction ?? 0, 4),
    requestedPvReduction: round(spec.pvReduction ?? 0, 4),
    actualGridReduction: round(actualGridReduction, 4),
    actualPvReduction: round(actualPvReduction, 4),
  }
  detail.contextSnapshot = detail.contextSnapshot || detail.meta?.contextSnapshot || null
  detail.targetEnvelope = {
    gridReduction: round(targetEnvelope.gridReduction ?? spec.gridReduction ?? 0, 4),
    pvReduction: round(targetEnvelope.pvReduction ?? spec.pvReduction ?? 0, 4),
    caReduction: round(targetEnvelope.caReduction ?? 0, 4),
    gmLift: round(targetEnvelope.gmLift ?? 0, 4),
    pemLift: round(targetEnvelope.pemLift ?? 0, 4),
    storageLift: round(targetEnvelope.storageLift ?? 0, 4),
  }
  detail.actualEnvelope = actualEnvelope
  detail.impactScore = impactScore
  detail.supportLiftSummary = {
    gm: round(actualGmLift, 4),
    pem: round(actualPemLift, 4),
    storage: round(actualStorageLift, 4),
  }
  detail.dispatchPrinciples = Array.isArray(detail.dispatchPrinciples) && detail.dispatchPrinciples.length
    ? detail.dispatchPrinciples
    : detail.keyAnchors
  detail.timeline = buildTimelineV2(detail, spec)
  detail.riskMatrix = buildRiskMatrixV2(detail, spec)
  detail.moduleStatus = buildModuleStatusV2(detail)
  detail.audit = {
    generationMode,
    requestedReductions: {
      gridReduction: round(spec.gridReduction ?? 0, 4),
      pvReduction: round(spec.pvReduction ?? 0, 4),
    },
    requestedAdjustments: {
      gridReduction: round(detail.targetEnvelope.gridReduction ?? 0, 4),
      pvReduction: round(detail.targetEnvelope.pvReduction ?? 0, 4),
      caReduction: round(detail.targetEnvelope.caReduction ?? 0, 4),
      gmLift: round(detail.targetEnvelope.gmLift ?? 0, 4),
      pemLift: round(detail.targetEnvelope.pemLift ?? 0, 4),
      storageLift: round(detail.targetEnvelope.storageLift ?? 0, 4),
    },
    actualReductions: {
      gridReduction: round(actualGridReduction, 4),
      pvReduction: round(actualPvReduction, 4),
    },
    actualAdjustments: actualEnvelope,
    validation: {
      passed: validationIssues.length === 0,
      issues: validationIssues,
      retries,
    },
    impactScore,
    fallbackReason: generationMode === 'template_fallback' ? validationIssues.join(' | ') : '',
    fallbackUsed: generationMode === 'template_fallback',
  }
  detail.meta = {
    ...(detail.meta || {}),
    generationMode,
    parameterSummary: spec.parameterSummary,
    parameterSource: spec.parameterSource,
    requestedReductions: {
      gridReduction: round(spec.gridReduction ?? 0, 4),
      pvReduction: round(spec.pvReduction ?? 0, 4),
    },
    actualReductions: {
      gridReduction: round(actualGridReduction, 4),
      pvReduction: round(actualPvReduction, 4),
    },
    presentationMode: spec.presentationMode || 'dramatic',
    responseWindowHours: spec.durationHours || WINDOW_HOURS,
    validationMessage: validationIssues.join(' | '),
  }
  return detail
}

function buildDetailFromPlanner(plan, context, spec, generationMode, validationIssues = [], retries = 0) {
  const baselineWindow = buildBaselineWindow(context.baselineDataset, context.activeStrategy, spec.startHour, context.viewDate)
  const rawPoints = extractPlannerPoints(plan, baselineWindow)
  const points = baselineWindow.points.map((baselinePoint, index) => normalizePlannerPoint(rawPoints[index], baselinePoint, index))
  const detail = {
    labels: baselineWindow.labels,
    points,
    series: buildSeriesFromPoints(points),
    summary: {},
    priorityOrder: Array.isArray(plan?.priorityOrder) && plan.priorityOrder.length
      ? plan.priorityOrder
      : ['P_G', 'P_PV', 'P_es_es', 'P_PEM', 'P_GM', 'P_CA'],
    keyAnchors: Array.isArray(plan?.keyAnchors) && plan.keyAnchors.length
      ? plan.keyAnchors.map((item) => String(item))
      : ['电网与光伏按事件边界降额', '燃机、PEM、储能作为补偿侧抬升', '电解槽在供能受限时联动压降'],
    explanation: String(plan?.explanation || '已生成应急调度指挥曲线。'),
    dispatchPrinciples: Array.isArray(plan?.dispatchPrinciples) ? plan.dispatchPrinciples.map((item) => String(item)) : [],
    timeline: plan?.timeline,
    riskMatrix: Array.isArray(plan?.riskMatrix) ? plan.riskMatrix : [],
    moduleStatus: Array.isArray(plan?.moduleStatus) ? plan.moduleStatus : [],
    meta: { plannerPointCount: Array.isArray(plan?.points) ? plan.points.length : rawPoints.length },
  }
  return enrichDetail(repairDetailAgainstConstraints(detail, context, spec), context, spec, generationMode, validationIssues, retries)
}

function buildDeterministicDispatch(context, spec, outline, options = {}) {
  const { activeStrategy, baselineDataset, viewDate } = context
  const startHour = spec.startHour
  const baseCA = interpolateHourlyWindow(baselineDataset.P_CA?.[activeStrategy], startHour)
  const basePV = interpolateHourlyWindow(baselineDataset.P_PV?.[activeStrategy], startHour)
  const baseGM = interpolateHourlyWindow(baselineDataset.P_GM?.[activeStrategy], startHour)
  const basePEM = interpolateHourlyWindow(baselineDataset.P_PEM?.[activeStrategy], startHour)
  const baseG = interpolateHourlyWindow(baselineDataset.P_G?.[activeStrategy], startHour)
  const baseES = interpolateHourlyWindow(baselineDataset.P_es_es, startHour)

  const gmCap = Math.max(maxValue(baseGM, 0), 260) * (options.strict ? 1.2 : 1.1)
  const pemCap = Math.max(maxValue(basePEM, 0), 180) * (options.strict ? 1.18 : 1.08)
  const gridBaseCap = Math.max(maxValue(baseG, 0), 600)
  const esPowerMax = Math.max(maxValue(baseES.map((value) => Math.abs(value)), 0), 220) * (options.strict ? 1.15 : 1.05)
  const esEnergyMax = esPowerMax * 2.5
  let esEnergyRemain = esEnergyMax

  const severityFactor = spec.severity === 'critical' ? 1 : 0.78
  const ramp = {
    grid: Math.max(40, gridBaseCap * 0.08),
    gm: Math.max(18, gmCap * 0.06),
    pem: Math.max(16, pemCap * 0.1),
    es: Math.max(25, esPowerMax * 0.18),
    ca: Math.max(28, maxValue(baseCA, 0) * 0.035),
  }

  let prev = {
    P_G: clamp((baseG[0] ?? 0) * (1 - spec.gridReduction), 0, gridBaseCap),
    P_GM: Math.min(baseGM[0] ?? 0, gmCap),
    P_PEM: Math.min(basePEM[0] ?? 0, pemCap),
    P_es_es: 0,
    P_CA: baseCA[0] ?? 0,
  }

  const labels = []
  const series = {
    P_CA: [],
    P_PV: [],
    P_GM: [],
    P_PEM: [],
    P_G: [],
    P_es_es: [],
    gap: [],
  }
  const points = []

  for (let i = 0; i < STEPS; i += 1) {
    const demandBase = Math.max(0, baseCA[i] ?? prev.P_CA)
    const pvBase = Math.max(0, basePV[i] ?? 0)
    const gridBase = Math.max(0, baseG[i] ?? 0)

    const pPV = round(clamp(pvBase * (1 - spec.pvReduction), 0, pvBase), 4)
    const gridCap = round(clamp(gridBase * (1 - spec.gridReduction), 0, gridBaseCap), 4)

    const netDemandAfterExternal = Math.max(0, demandBase - pPV)
    const pGrid = round(applyRamp(Math.min(gridCap, netDemandAfterExternal), prev.P_G, ramp.grid, gridCap), 4)

    let shortage = Math.max(0, demandBase - pPV - pGrid)

    const esCapNow = Math.min(esPowerMax, esEnergyRemain * (60 / STEP_MINUTES))
    const pES = round(applyRamp(Math.min(esCapNow, shortage), prev.P_es_es, ramp.es, esCapNow), 4)
    shortage = Math.max(0, shortage - pES)
    esEnergyRemain = Math.max(0, esEnergyRemain - pES * (STEP_MINUTES / 60))

    const pemNeedRatio = clamp(0.55 + spec.gridReduction * 0.2 + spec.pvReduction * 0.08, 0.35, 0.9)
    const pemTarget = shortage > 0 ? Math.min(pemCap, shortage * pemNeedRatio) : 0
    const pPEM = round(applyRamp(pemTarget, prev.P_PEM, ramp.pem, pemCap), 4)
    shortage = Math.max(0, shortage - pPEM)

    const gmTarget = shortage > 0 ? Math.min(gmCap, shortage * (1 + spec.gridReduction * 0.25) * severityFactor) : 0
    const pGM = round(applyRamp(gmTarget, prev.P_GM, ramp.gm, gmCap), 4)
    shortage = Math.max(0, shortage - pGM)

    const flexibleSupply = pPV + pGrid + pES + pPEM + pGM
    const curtailment = round(Math.max(0, demandBase - flexibleSupply), 4)
    const caFloorRatio = options.strict ? 0.7 : 0.82
    const pCATarget = Math.max(demandBase - curtailment, demandBase * caFloorRatio * (1 - 0.25 * spec.gridReduction))
    let pCA = round(applyRamp(Math.min(demandBase, pCATarget), prev.P_CA, ramp.ca, demandBase), 4)

    if (curtailment > 0) pCA = round(Math.min(pCA, demandBase - curtailment), 4)
    if (spec.gridReduction > 0 || spec.pvReduction > 0) pCA = Math.min(pCA, round(demandBase, 4))

    const supplyTotal = round(pPV + pGrid + pES + pPEM + pGM, 4)
    const residualGap = round(Math.max(0, pCA - supplyTotal), 4)
    const totalGap = round(Math.max(curtailment, residualGap), 4)
    const curtailmentRatio = demandBase > 0 ? totalGap / demandBase : 0
    const riskLevel = totalGap > 220 || curtailmentRatio > 0.12
      ? 'high'
      : totalGap > 60 || curtailmentRatio > 0.04
        ? 'medium'
        : 'low'
    const time = makeTimeLabel(viewDate, startHour, i)

    labels.push(time.label)
    series.P_CA.push(round(pCA, 4))
    series.P_PV.push(pPV)
    series.P_G.push(pGrid)
    series.P_es_es.push(pES)
    series.P_PEM.push(pPEM)
    series.P_GM.push(pGM)
    series.gap.push(totalGap)

    points.push({
      index: i,
      label: time.label,
      timestamp: time.timestamp,
      P_CA: round(pCA, 4),
      P_PV: pPV,
      P_G: pGrid,
      P_es_es: pES,
      P_PEM: pPEM,
      P_GM: pGM,
      supplyTotal,
      gap: totalGap,
      riskLevel,
    })

    prev = { P_G: pGrid, P_GM: pGM, P_PEM: pPEM, P_es_es: pES, P_CA: pCA }
  }

  return {
    labels,
    points,
    series,
    summary: {},
    priorityOrder: outline.priorityOrder,
    keyAnchors: outline.keyAnchors,
    explanation: outline.explanation,
    dispatchPrinciples: outline.keyAnchors,
    timeline: [],
    riskMatrix: [],
    moduleStatus: [],
    meta: {
      generationMode: 'template_fallback',
      validationMessage: options.validationMessage || '',
    },
  }
}

function buildDetailFromIntent(plan, context, spec, contextPackage, generationMode, validationIssues = [], retries = 0) {
  const intent = normalizeDispatchIntent(plan, contextPackage, spec)
  const detail = buildDramaticDispatch(context, spec, intent, {
    contextPackage,
    generationMode,
    validationMessage: validationIssues.join(' | '),
  })
  return enrichDetail(detail, context, spec, generationMode, validationIssues, retries)
}

function buildDramaticDispatch(context, spec, intent, options = {}) {
  const contextPackage = options.contextPackage || buildEmergencyContextPackage(context, spec)
  const baselineWindow = contextPackage.baselineWindow
  const labels = baselineWindow.labels
  const stagePlan = Array.isArray(intent.stagePlan) && intent.stagePlan.length
    ? intent.stagePlan
    : normalizeStagePlan([], labels, spec)
  const target = intent.targetAdjustments || buildDefaultDispatchIntent(contextPackage, spec).targetAdjustments
  const supportPriority = Array.isArray(intent.supportPriority) && intent.supportPriority.length
    ? intent.supportPriority
    : ['P_GM', 'P_es_es', 'P_PEM']
  const bounds = contextPackage.bounds || contextPackage.currentSnapshot?.bounds || {}
  const gmCap = bounds.P_GM?.max ?? Math.max(maxValue(baselineWindow.series.P_GM), 420) * 1.9
  const pemCap = bounds.P_PEM?.max ?? Math.max(maxValue(baselineWindow.series.P_PEM), 280) * 1.85
  const esCap = bounds.P_es_es?.max ?? Math.max(maxValue(baselineWindow.series.P_es_es.map((value) => Math.max(0, value))), 260) * 1.9
  const ramp = {
    grid: bounds.P_G?.ramp ?? RAMP_LIMITS.P_G,
    gm: bounds.P_GM?.ramp ?? RAMP_LIMITS.P_GM,
    pem: bounds.P_PEM?.ramp ?? RAMP_LIMITS.P_PEM,
    es: bounds.P_es_es?.ramp ?? RAMP_LIMITS.P_es_es,
    ca: bounds.P_CA?.ramp ?? RAMP_LIMITS.P_CA,
  }
  const priorities = supportPriority.filter((metric) => ['P_GM', 'P_PEM', 'P_es_es'].includes(metric))
  while (priorities.length < 3) {
    const next = ['P_GM', 'P_es_es', 'P_PEM'].find((metric) => !priorities.includes(metric))
    if (!next) break
    priorities.push(next)
  }
  const supportWeights = {
    [priorities[0]]: 0.42,
    [priorities[1]]: 0.33,
    [priorities[2]]: 0.25,
  }
  const series = {
    P_CA: [],
    P_PV: [],
    P_GM: [],
    P_PEM: [],
    P_G: [],
    P_es_es: [],
    gap: [],
  }
  const points = []
  let prev = {
    P_G: baselineWindow.series.P_G[0] || 0,
    P_GM: baselineWindow.series.P_GM[0] || 0,
    P_PEM: baselineWindow.series.P_PEM[0] || 0,
    P_es_es: Math.max(0, baselineWindow.series.P_es_es[0] || 0),
    P_CA: baselineWindow.series.P_CA[0] || 0,
  }

  for (let i = 0; i < STEPS; i += 1) {
    const stage = stageForIndex(stagePlan, i)
    const base = baselineWindow.points[i]
    const supportPulse = stage.phase === 'stabilize'
      ? 1 + 0.08 * Math.sin(i / 2.8)
      : stage.phase === 'response'
        ? 1 + 0.05 * Math.sin(i / 1.9)
        : stage.phase === 'reserve'
          ? 1 - 0.04 * Math.cos(i / 3.4)
          : 1

    const gridReductionNow = clamp(target.gridReductionTarget * (stage.gridReductionFactor || 1), 0, 0.98)
    const pvReductionNow = clamp(target.pvReductionTarget * (stage.pvReductionFactor || 1), 0, 0.95)
    const caReductionNow = clamp(target.caReductionTarget * (stage.caReductionFactor || 1), 0.15, 0.76)

    const pGridTarget = base.P_G * (1 - gridReductionNow)
    const pPV = round(clamp(base.P_PV * (1 - pvReductionNow), 0, base.P_PV), 4)
    const pGrid = round(applyRamp(pGridTarget, prev.P_G, ramp.grid, Math.max(base.P_G, pGridTarget)), 4)
    const demandBase = Math.max(0, base.P_CA)
    const pCATarget = round(Math.max(demandBase * (1 - caReductionNow), demandBase * 0.18), 4)
    let shortage = Math.max(0, pCATarget - pPV - pGrid)

    const baseGM = Math.max(0, base.P_GM)
    const basePEM = Math.max(0, base.P_PEM)
    const baseES = Math.max(0, base.P_es_es)
    let gmVisible = Math.min(gmCap - baseGM, Math.max(shortage * 0.24, 70) * (stage.supportLiftFactor || 1) + baseGM * target.gmLiftTarget * 0.22)
    let pemVisible = Math.min(pemCap - basePEM, Math.max(shortage * 0.18, 55) * (stage.supportLiftFactor || 1) + Math.max(basePEM, 120) * target.pemLiftTarget * 0.22)
    let esVisible = Math.min(esCap - baseES, Math.max(shortage * 0.22, 85) * (stage.supportLiftFactor || 1) + Math.max(baseES, 140) * target.storageLiftTarget * 0.22)
    const minVisibleTotal = gmVisible + pemVisible + esVisible
    if (minVisibleTotal > shortage && minVisibleTotal > 0) {
      const scale = shortage / minVisibleTotal
      gmVisible *= scale
      pemVisible *= scale
      esVisible *= scale
    }
    shortage = Math.max(0, shortage - gmVisible - pemVisible - esVisible)

    const gmTarget = round(baseGM + Math.min(gmCap - baseGM, (gmVisible + shortage * (supportWeights.P_GM || 0)) * supportPulse), 4)
    const pemTarget = round(basePEM + Math.min(pemCap - basePEM, (pemVisible + shortage * (supportWeights.P_PEM || 0)) * supportPulse), 4)
    const esTarget = round(baseES + Math.min(esCap - baseES, (esVisible + shortage * (supportWeights.P_es_es || 0)) * supportPulse), 4)
    const pGM = round(applyRamp(gmTarget, prev.P_GM, ramp.gm, gmCap), 4)
    const pPEM = round(applyRamp(pemTarget, prev.P_PEM, ramp.pem, pemCap), 4)
    const pES = round(applyRamp(esTarget, prev.P_es_es, ramp.es, esCap), 4)

    const supplyTotal = round(pPV + pGrid + pGM + pPEM + pES, 4)
    const pCA = round(Math.min(pCATarget, supplyTotal), 4)
    const gap = round(Math.max(0, pCA - supplyTotal), 4)
    const supportTotal = pGM + pPEM + pES
    const riskLevel = gap > 150 || supportTotal > demandBase * 0.42 || (spec.gridReduction || 0) >= 0.4
      ? 'high'
      : gap > 40 || supportTotal > demandBase * 0.24
        ? 'medium'
        : 'low'
    const time = makeTimeLabel(context.viewDate, spec.startHour, i)

    points.push({
      index: i,
      label: time.label,
      timestamp: time.timestamp,
      P_CA: pCA,
      P_PV: pPV,
      P_GM: pGM,
      P_PEM: pPEM,
      P_G: pGrid,
      P_es_es: pES,
      supplyTotal,
      gap,
      riskLevel,
    })

    series.P_CA.push(pCA)
    series.P_PV.push(pPV)
    series.P_GM.push(pGM)
    series.P_PEM.push(pPEM)
    series.P_G.push(pGrid)
    series.P_es_es.push(pES)
    series.gap.push(gap)

    prev = { P_G: pGrid, P_GM: pGM, P_PEM: pPEM, P_es_es: pES, P_CA: pCA }
  }

  const priorityOrder = ['P_G', 'P_PV', ...priorities, 'P_CA']
  const keyAnchors = [
    `Grid reduction target ${Math.round((target.gridReductionTarget || 0) * 100)}% is enforced numerically.`,
    `PV reduction target ${Math.round((target.pvReductionTarget || 0) * 100)}% is enforced numerically.`,
    'Electrolyzer load is pulled down visibly when external supply is damaged.',
    'GM, PEM and storage all rise together to create a dramatic emergency response.',
  ]

  return {
    labels,
    points,
    series,
    summary: {},
    priorityOrder,
    keyAnchors,
    explanation: String(intent.explanation || 'Emergency dispatch generated from realtime snapshot and dramatic coordinated synthesis.'),
    dispatchPrinciples: Array.isArray(intent.dispatchPrinciples) ? intent.dispatchPrinciples : keyAnchors,
    timeline: Array.isArray(intent.timeline) ? intent.timeline : [],
    riskMatrix: [],
    moduleStatus: Array.isArray(intent.moduleStatus) ? intent.moduleStatus : [],
    stagePlan,
    contextSnapshot: contextPackage.currentSnapshot,
    targetEnvelope: {
      gridReduction: round(target.gridReductionTarget || 0, 4),
      pvReduction: round(target.pvReductionTarget || 0, 4),
      caReduction: round(target.caReductionTarget || 0, 4),
      gmLift: round(target.gmLiftTarget || 0, 4),
      pemLift: round(target.pemLiftTarget || 0, 4),
      storageLift: round(target.storageLiftTarget || 0, 4),
    },
    meta: {
      generationMode: options.generationMode || 'llm_direct',
      validationMessage: options.validationMessage || '',
      contextSnapshot: contextPackage.currentSnapshot,
    },
  }
}

function validateDispatch(detail, context, spec) {
  const issues = []
  const required = ['P_CA', 'P_PV', 'P_GM', 'P_PEM', 'P_G', 'P_es_es', 'gap']
  for (const key of required) {
    const values = detail.series?.[key]
    if (!Array.isArray(values) || values.length !== STEPS) {
      issues.push(`missing_${key}`)
      continue
    }
    if (values.some((value) => !Number.isFinite(value) || value < -1e-6)) issues.push(`invalid_${key}`)
  }

  const { activeStrategy, baselineDataset } = context
  const baseCA = interpolateHourlyWindow(baselineDataset.P_CA?.[activeStrategy], spec.startHour)
  const basePV = interpolateHourlyWindow(baselineDataset.P_PV?.[activeStrategy], spec.startHour)
  const baseG = interpolateHourlyWindow(baselineDataset.P_G?.[activeStrategy], spec.startHour)
  const baseGM = interpolateHourlyWindow(baselineDataset.P_GM?.[activeStrategy], spec.startHour)
  const basePEM = interpolateHourlyWindow(baselineDataset.P_PEM?.[activeStrategy], spec.startHour)
  const baseES = interpolateHourlyWindow(baselineDataset.P_es_es, spec.startHour)

  const avgBaseGrid = average(baseG)
  const avgPlanGrid = average(detail.series.P_G)
  const peakBaseGrid = maxValue(baseG)
  const peakPlanGrid = maxValue(detail.series.P_G)
  const avgBasePv = average(basePV)
  const avgPlanPv = average(detail.series.P_PV)
  const avgBaseCA = average(baseCA)
  const avgPlanCA = average(detail.series.P_CA)

  if (detail.points.some((point) => point.P_CA > point.supplyTotal + 1.5)) {
    issues.push('supply_not_closed')
  }

  if (spec.gridReduction > 0 && avgBaseGrid > 0) {
    const tolerance = spec.parameterSource?.gridReduction === 'user' ? 0.06 : 0.12
    const allowedAvgMax = avgBaseGrid * (1 - Math.max(0, spec.gridReduction - tolerance))
    const allowedPeakMax = peakBaseGrid * (1 - Math.max(0, spec.gridReduction - tolerance))
    if (avgPlanGrid > allowedAvgMax + 1) issues.push('grid_mean_not_reduced')
    if (peakPlanGrid > allowedPeakMax + 1) issues.push('grid_peak_not_reduced')
  }

  if (spec.pvReduction > 0 && avgBasePv > 0) {
    const tolerance = spec.parameterSource?.pvReduction === 'user' ? 0.06 : 0.12
    const minExpectedReduction = Math.max(0, spec.pvReduction - tolerance)
    const actualReduction = 1 - avgPlanPv / avgBasePv
    if (actualReduction < minExpectedReduction) issues.push('pv_not_reduced_enough')
  }

  const actualGridReduction = avgBaseGrid > 0 ? 1 - avgPlanGrid / avgBaseGrid : 0
  const actualPvReduction = avgBasePv > 0 ? 1 - avgPlanPv / avgBasePv : 0
  const actualCaReduction = avgBaseCA > 0 ? 1 - avgPlanCA / avgBaseCA : 0
  const avgBaseGM = average(baseGM)
  const avgBasePEM = average(basePEM)
  const avgBaseES = average(baseES.map((value) => Math.max(0, value)))
  const actualGmLift = computeLiftRatio(detail.series.P_GM, baseGM, 280)
  const actualPemLift = computeLiftRatio(detail.series.P_PEM, basePEM, 180)
  const actualStorageLift = computeLiftRatio(detail.series.P_es_es, baseES.map((value) => Math.max(0, value)), 180)

  if (spec.parameterSource?.gridReduction === 'user' && spec.gridReduction > 0) {
    if (actualGridReduction + 0.06 < spec.gridReduction) issues.push('grid_user_parameter_deviated')
  }

  if (spec.parameterSource?.pvReduction === 'user' && spec.pvReduction > 0 && avgBasePv > 0) {
    if (actualPvReduction + 0.06 < spec.pvReduction) issues.push('pv_user_parameter_deviated')
  }

  if ((spec.gridReduction > 0 || spec.pvReduction > 0) && avgPlanCA > avgBaseCA + 1) {
    issues.push('ca_above_baseline_under_disturbance')
  }

  const minCaReduction = clamp(0.12 + (spec.gridReduction || 0) * 0.38 + (spec.pvReduction || 0) * 0.18, 0.12, 0.62)
  if ((spec.gridReduction > 0 || spec.pvReduction > 0) && actualCaReduction + 0.03 < minCaReduction) {
    issues.push('ca_not_reduced_enough')
  }

  const internalCompensationInsufficient = detail.points.some((point, index) => {
    const externalLoss = (baseG[index] ?? 0) - (detail.series.P_G[index] ?? 0) + (basePV[index] ?? 0) - (detail.series.P_PV[index] ?? 0)
    const internalGain = (detail.series.P_GM[index] ?? 0) + (detail.series.P_PEM[index] ?? 0) + (detail.series.P_es_es[index] ?? 0)
      - ((baseGM[index] ?? 0) + (basePEM[index] ?? 0) + Math.max(0, baseES[index] ?? 0))
    return externalLoss > Math.max(0, internalGain) + 1 && point.gap > 0
  })

  if (internalCompensationInsufficient && avgPlanCA > avgBaseCA + 1) {
    issues.push('ca_above_baseline_when_supply_insufficient')
  }

  if (detail.points.some((point, index) => {
    const externalLoss = Math.max(0, (baseG[index] ?? 0) - (detail.series.P_G[index] ?? 0))
      + Math.max(0, (basePV[index] ?? 0) - (detail.series.P_PV[index] ?? 0))
    return externalLoss > 1 && point.P_CA > (baseCA[index] ?? 0) + 1
  })) {
    issues.push('ca_rises_when_external_supply_drops')
  }

  const severeEvent = (spec.gridReduction || 0) >= 0.4 || (spec.pvReduction || 0) >= 0.25 || spec.type === 'typhoon_weather'
  if (severeEvent) {
    if (avgBaseGM > 0 && actualGmLift < 0.12) issues.push('gm_not_lifted_enough')
    if ((avgBasePEM > 0 || average(detail.series.P_PEM) > 0) && actualPemLift < 0.12) issues.push('pem_not_lifted_enough')
    if ((avgBaseES > 0 || average(detail.series.P_es_es) > 0) && actualStorageLift < 0.15) issues.push('storage_not_lifted_enough')
    if (detail.points.every((point) => point.riskLevel === 'low')) issues.push('risk_too_low_for_severe_event')
  }

  for (const metric of METRIC_ORDER) {
    const values = detail.series?.[metric] || []
    const limit = RAMP_LIMITS[metric]
    for (let i = 1; i < values.length; i += 1) {
      if (Math.abs(values[i] - values[i - 1]) > limit) {
        issues.push(`${metric}_ramp_exceeded`)
        break
      }
    }
  }

  return { valid: issues.length === 0, issues }
}

function computeSummaryFromDataset(dataset, baselineSummary, priceGrid, carbonGrid) {
  for (const strategy of STRATEGIES) {
    const pGrid = ensureArray(dataset.P_G?.[strategy])
    const pGM = ensureArray(dataset.P_GM?.[strategy])
    const cost = pGrid.reduce((sum, value, index) => sum + value * (priceGrid[index] ?? 0), 0)
      + pGM.reduce((sum, value) => sum + value * GM_FUEL_COST_PER_KWH, 0)
    const carbon = pGrid.reduce((sum, value, index) => sum + value * (carbonGrid[index] ?? 0), 0)
      + pGM.reduce((sum, value) => sum + value * GM_CARBON_PER_KWH, 0)
    const ref = baselineSummary?.[strategy] ?? { cost: Math.max(cost, 1), carbon: Math.max(carbon, 1) }
    dataset.summary[strategy] = {
      cost: round(cost, 2),
      carbon: round(carbon, 2),
      combined: round(0.5 * (cost / Math.max(ref.cost, 1)) + 0.5 * (carbon / Math.max(ref.carbon, 1)), 2),
    }
  }
}

function buildEmergencyDataset(context, detail, spec, runMeta = {}) {
  const { baselineDataset, activeStrategy, viewDate } = context
  const dataset = deepClone(baselineDataset)
  const firstHours = avgChunk(detail.series.P_CA).length
  const startHour = spec.startHour

  const selectedBase = {
    P_CA: ensureArray(baselineDataset.P_CA?.[activeStrategy]),
    P_PV: ensureArray(baselineDataset.P_PV?.[activeStrategy]),
    P_GM: ensureArray(baselineDataset.P_GM?.[activeStrategy]),
    P_PEM: ensureArray(baselineDataset.P_PEM?.[activeStrategy]),
    P_G: ensureArray(baselineDataset.P_G?.[activeStrategy]),
    H_CA: ensureArray(baselineDataset.H_CA?.[activeStrategy]),
    H_PEM: ensureArray(baselineDataset.H_PEM?.[activeStrategy]),
  }
  const hourlyEmergency = {
    P_CA: avgChunk(detail.series.P_CA),
    P_PV: avgChunk(detail.series.P_PV),
    P_GM: avgChunk(detail.series.P_GM),
    P_PEM: avgChunk(detail.series.P_PEM),
    P_G: avgChunk(detail.series.P_G),
    P_es_es: avgChunk(detail.series.P_es_es),
  }

  for (const strategy of STRATEGIES) {
    for (let offset = 0; offset < firstHours; offset += 1) {
      const hour = clamp(startHour + offset, 0, 23)
      dataset.P_CA[strategy][hour] = round(hourlyEmergency.P_CA[offset] ?? dataset.P_CA[strategy][hour] ?? 0, 4)
      dataset.P_PV[strategy][hour] = round(hourlyEmergency.P_PV[offset] ?? dataset.P_PV[strategy][hour] ?? 0, 4)
      dataset.P_GM[strategy][hour] = round(hourlyEmergency.P_GM[offset] ?? dataset.P_GM[strategy][hour] ?? 0, 4)
      dataset.P_PEM[strategy][hour] = round(hourlyEmergency.P_PEM[offset] ?? dataset.P_PEM[strategy][hour] ?? 0, 4)
      dataset.P_G[strategy][hour] = round(hourlyEmergency.P_G[offset] ?? dataset.P_G[strategy][hour] ?? 0, 4)

      const baseCa = Math.max(selectedBase.P_CA[hour] ?? 0, 1)
      const basePem = Math.max(selectedBase.P_PEM[hour] ?? 0, 1)
      const caScale = (hourlyEmergency.P_CA[offset] ?? baseCa) / baseCa
      const pemScale = (hourlyEmergency.P_PEM[offset] ?? basePem) / basePem
      dataset.H_CA[strategy][hour] = round((selectedBase.H_CA[hour] ?? dataset.H_CA[strategy][hour] ?? 0) * caScale, 6)
      dataset.H_PEM[strategy][hour] = round((selectedBase.H_PEM[hour] ?? dataset.H_PEM[strategy][hour] ?? 0) * pemScale, 6)
    }
  }

  for (let offset = 0; offset < firstHours; offset += 1) {
    const hour = clamp(startHour + offset, 0, 23)
    dataset.P_es_es[hour] = round(hourlyEmergency.P_es_es[offset] ?? dataset.P_es_es[hour] ?? 0, 4)
  }

  const snapshot = readRealtimeSnapshot(viewDate)
  computeSummaryFromDataset(dataset, baselineDataset.summary, snapshot.prices, snapshot.carbon)
  dataset._meta = {
    ...(dataset._meta || {}),
    datasetType: 'emergency',
    viewDate,
    snapshotAt: formatBeijingDateTime(),
    isHistorical: false,
    baselineDatasetId: runMeta.baselineDatasetId ?? dataset._meta?.datasetId ?? null,
    emergencyRunId: runMeta.emergencyRunId ?? null,
    emergencyActive: Boolean(runMeta.emergencyActive),
    emergencyTitle: spec.title,
    emergencyMode: 'single',
  }

  return dataset
}

function resolveBaselineInput(payload = {}) {
  if (payload.baselineDataset) {
    return {
      data: deepClone(payload.baselineDataset),
      meta: payload.baselineMeta || payload.baselineDataset._meta || {},
    }
  }

  if (payload.baselineDatasetId) {
    const row = getDatasetById(payload.baselineDatasetId)
    if (row) {
      return {
        data: deepClone(row.data),
        meta: row.data?._meta || { datasetId: row.id, datasetName: row.name },
      }
    }
  }

  const latestApplied = getLatestAppliedEmergencyRun()
  if (latestApplied?.baseline_dataset_id) {
    const row = getDatasetById(latestApplied.baseline_dataset_id)
    if (row) {
      return {
        data: deepClone(row.data),
        meta: row.data?._meta || { datasetId: row.id, datasetName: row.name },
      }
    }
  }

  return null
}

function serializeRun(row, { includeDatasets = false } = {}) {
  if (!row) return null
  const run = {
    id: row.id,
    title: row.title,
    source: row.source,
    severity: row.severity,
    status: row.status,
    degraded: Boolean(row.degraded),
    baselineDatasetId: row.baseline_dataset_id ?? null,
    emergencyDatasetId: row.emergency_dataset_id ?? null,
    eventSpec: row.event_spec,
    detailPayload: row.detail_payload,
    explanation: row.explanation || row.detail_payload?.explanation || '',
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    restoredAt: row.restored_at,
    baselinePayload: row.baseline_payload ?? null,
  }

  if (includeDatasets) {
    const emergencyDataset = row.emergency_dataset_id ? getDatasetById(row.emergency_dataset_id) : null
    const baselineDataset = row.baseline_dataset_id ? getDatasetById(row.baseline_dataset_id) : null
    run.emergencyDataset = emergencyDataset
      ? {
          id: emergencyDataset.id,
          name: emergencyDataset.name,
          data: emergencyDataset.data,
          meta: emergencyDataset.data?._meta || {},
        }
      : null
    run.baselineDataset = baselineDataset
      ? {
          id: baselineDataset.id,
          name: baselineDataset.name,
          data: baselineDataset.data,
          meta: baselineDataset.data?._meta || {},
        }
      : row.baseline_payload ?? null
  }

  return run
}

async function generateEmergencyDispatchWithLLM(payload, options, context, eventSpec) {
  const contextPackage = buildEmergencyContextPackage(context, eventSpec)
  let feedbackIssues = []
  let lastError = 'planner_failed'

  for (let attempt = 0; attempt < MAX_LLM_ATTEMPTS; attempt += 1) {
    try {
      const plan = await planEmergencyDispatch(eventSpec, context, options.planner, contextPackage, feedbackIssues, attempt)
      const detail = buildDetailFromIntent(
        plan,
        context,
        eventSpec,
        contextPackage,
        attempt === 0 ? 'llm_direct' : 'llm_corrected',
        feedbackIssues,
        attempt,
      )
      const validation = validateDispatch(detail, context, eventSpec)
      if (validation.valid) {
        detail.audit.validation = {
          passed: true,
          issues: validation.issues,
          retries: attempt,
        }
        detail.meta.validationMessage = validation.issues.join(' | ')
        return { detail, degraded: false }
      }
      feedbackIssues = validation.issues
      lastError = validation.issues.join(',')
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      feedbackIssues = feedbackIssues.length ? feedbackIssues : [lastError]
    }
  }

  throw new Error(lastError || 'llm_generation_failed')
}

export async function createEmergencyDispatch(payload = {}, options = {}) {
  const source = payload.source || 'manual'
  const baseline = resolveBaselineInput(payload)
  if (!baseline?.data) throw new Error('无法解析应急调度基线数据')

  const activeStrategy = payload.activeStrategy || 'es'
  const baselineMeta = baseline.meta || {}
  const viewDate = baselineMeta.viewDate || getBeijingDate()
  const eventSpec = normalizeEventSpec(payload.eventSpec, payload.prompt || '')
  const context = {
    baselineDataset: baseline.data,
    activeStrategy,
    viewDate,
  }
  const contextPackage = buildEmergencyContextPackage(context, eventSpec)

  let detail
  let degraded = false
  let fallbackReason = ''

  try {
    const generated = await generateEmergencyDispatchWithLLM(payload, options, context, eventSpec)
    detail = generated.detail
    degraded = generated.degraded
  } catch (error) {
    fallbackReason = error instanceof Error ? error.message : String(error)
    const fallbackIntent = buildFallbackIntent(eventSpec, contextPackage, fallbackReason)
    detail = enrichDetail(buildDramaticDispatch(context, eventSpec, fallbackIntent, {
      contextPackage,
      generationMode: 'template_fallback',
      validationMessage: fallbackReason,
    }), context, eventSpec, 'template_fallback', fallbackReason ? [fallbackReason] : [], MAX_LLM_ATTEMPTS)
    degraded = true
  }

  const db = getDb()
  const baselineDatasetId = baselineMeta.datasetId ?? payload.baselineDatasetId ?? null
  const emergencyDataset = buildEmergencyDataset(context, detail, eventSpec, {
    baselineDatasetId,
    emergencyActive: false,
  })

  const datasetName = `应急预案 ${eventSpec.title} ${formatBeijingDateTime()}`
  const datasetInfo = db.prepare('INSERT INTO datasets (name, data) VALUES (?, ?)').run(datasetName, JSON.stringify(emergencyDataset))
  const emergencyDatasetId = Number(datasetInfo.lastInsertRowid)
  emergencyDataset._meta = {
    ...emergencyDataset._meta,
    datasetId: emergencyDatasetId,
    datasetName,
    emergencyActive: false,
    emergencyMode: 'single',
  }
  db.prepare('UPDATE datasets SET data = ? WHERE id = ?').run(JSON.stringify(emergencyDataset), emergencyDatasetId)

  const runId = createEmergencyRun({
    title: eventSpec.title,
    source,
    severity: eventSpec.severity,
    status: 'planned',
    degraded,
    baseline_dataset_id: baselineDatasetId,
    emergency_dataset_id: emergencyDatasetId,
    baseline_payload: baselineDatasetId ? null : baseline,
    event_spec: eventSpec,
    detail_payload: detail,
    explanation: detail.explanation,
  })

  const finalDataset = {
    ...emergencyDataset,
    _meta: {
      ...emergencyDataset._meta,
      emergencyRunId: runId,
    },
  }
  db.prepare('UPDATE datasets SET data = ? WHERE id = ?').run(JSON.stringify(finalDataset), emergencyDatasetId)

  const created = getEmergencyRunById(runId)
  const generationMode = detail?.audit?.generationMode || detail?.meta?.generationMode || 'unknown'
  pushServerLog({
    level: degraded ? 'warn' : 'ok',
    status: 'done',
    scope: 'emergency',
    message: `${source === 'auto' ? '自动' : '手动'}应急预案已生成`,
    targetDate: viewDate,
    algorithm: generationMode,
    detail: `${eventSpec.title} | datasetId ${emergencyDatasetId} | ${eventSpec.parameterSummary}`,
  })

  const serialized = serializeRun(created, { includeDatasets: true })
  if (options.broadcast !== false) broadcastEmergencyPlanCreated(serialized)
  return serialized
}

export function listSerializedEmergencyRuns(limit = 20) {
  return listEmergencyRuns(limit).map((row) => serializeRun(row, { includeDatasets: true }))
}

export function getSerializedEmergencyRun(id) {
  return serializeRun(getEmergencyRunById(id), { includeDatasets: true })
}

export function applyEmergencyRun(id) {
  const row = getEmergencyRunById(id)
  if (!row) throw new Error('应急预案不存在')
  if (!row.emergency_dataset_id) throw new Error('应急预案缺少应急数据集')
  const dataset = getDatasetById(row.emergency_dataset_id)
  if (!dataset) throw new Error('应急数据集不存在')

  const meta = {
    ...(dataset.data?._meta || {}),
    datasetType: 'emergency',
    datasetId: dataset.id,
    datasetName: dataset.name,
    emergencyRunId: row.id,
    baselineDatasetId: row.baseline_dataset_id ?? null,
    emergencyActive: true,
    emergencyMode: 'single',
  }
  const nextData = { ...dataset.data, _meta: meta }
  getDb().prepare('UPDATE datasets SET data = ? WHERE id = ?').run(JSON.stringify(nextData), dataset.id)

  const updated = updateEmergencyRun(id, {
    status: 'applied',
    applied_at: formatBeijingDateTime(),
    restored_at: null,
  })
  const serialized = {
    run: serializeRun(updated, { includeDatasets: true }),
    dataset: { id: dataset.id, name: dataset.name, data: nextData, meta },
  }
  broadcastEmergencyApplied(serialized)
  pushServerLog({
    level: 'warn',
    status: 'done',
    scope: 'emergency',
    message: '应急预案已应用到全站展示',
    targetDate: meta.viewDate || getBeijingDate(),
    detail: `${updated.title} | runId ${id}`,
  })
  return serialized
}

export function restoreEmergencyState(runId = null) {
  const row = runId ? getEmergencyRunById(runId) : getLatestAppliedEmergencyRun()
  if (!row) throw new Error('当前没有可恢复的应急预案')

  let baseline = null
  if (row.baseline_dataset_id) {
    const baselineRow = getDatasetById(row.baseline_dataset_id)
    if (baselineRow) {
      baseline = {
        id: baselineRow.id,
        name: baselineRow.name,
        data: baselineRow.data,
        meta: baselineRow.data?._meta || {},
      }
    }
  }
  if (!baseline && row.baseline_payload) {
    baseline = {
      id: row.baseline_payload?.meta?.datasetId ?? null,
      name: row.baseline_payload?.meta?.datasetName ?? '基线数据',
      data: row.baseline_payload?.data ?? row.baseline_payload,
      meta: row.baseline_payload?.meta ?? row.baseline_payload?.data?._meta ?? {},
    }
  }
  if (!baseline?.data) throw new Error('基线数据不存在，无法恢复')

  const updated = updateEmergencyRun(row.id, {
    status: 'restored',
    restored_at: formatBeijingDateTime(),
  })
  const payload = {
    run: serializeRun(updated, { includeDatasets: true }),
    baselineDataset: {
      ...baseline,
      meta: {
        ...(baseline.meta || {}),
        emergencyActive: false,
        emergencyRunId: null,
        emergencyTitle: '',
        emergencyMode: 'single',
      },
    },
  }
  broadcastEmergencyRestored(payload)
  pushServerLog({
    level: 'ok',
    status: 'done',
    scope: 'emergency',
    message: '已恢复到应急前展示状态',
    targetDate: baseline.meta?.viewDate || getBeijingDate(),
    detail: `${updated.title} | runId ${row.id}`,
  })
  return payload
}
