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
    ? '已按台风天气与外部供能受损场景生成 4 小时应急调度。'
    : '已按突发供能受限场景生成 4 小时应急调度。'
  const explanation = reason
    ? `${explanationBase} 由于原方案未满足参数或物理约束，已切换为显式参数驱动的确定性方案。`
    : `${explanationBase} 当前数值曲线严格受事件参数驱动，不允许话术与调度结果脱节。`

  return { priorityOrder, keyAnchors, explanation, degraded: true }
}

async function planEmergencyOutline(spec, context, planner) {
  if (!planner) return buildFallbackOutline(spec)
  try {
    const result = await planner({
      spec,
      prompt: spec.rawPrompt || spec.title,
      baselineSummary: context.baselineDataset?.summary ?? {},
      activeStrategy: context.activeStrategy,
    })
    const fallback = buildFallbackOutline(spec)
    return {
      priorityOrder: Array.isArray(result?.priorityOrder) && result.priorityOrder.length
        ? result.priorityOrder
        : fallback.priorityOrder,
      keyAnchors: Array.isArray(result?.keyAnchors) && result.keyAnchors.length
        ? result.keyAnchors
        : fallback.keyAnchors,
      explanation: String(result?.explanation || fallback.explanation),
      degraded: false,
    }
  } catch {
    return buildFallbackOutline(spec, 'planner_failed')
  }
}

function readRealtimeSnapshot(viewDate) {
  const db = getDb()
  const rows = db.prepare(
    'SELECT hour, price_grid, ef_grid FROM realtime_data WHERE data_date = ? ORDER BY hour'
  ).all(viewDate)
  const prices = Array.from({ length: 24 }, () => 0.62)
  const carbon = Array.from({ length: 24 }, () => 0.00058)
  for (const row of rows) {
    prices[row.hour] = toNumber(row.price_grid, prices[row.hour])
    carbon[row.hour] = toNumber(row.ef_grid, carbon[row.hour])
  }
  return { prices, carbon }
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

  const actualGridReduction = average(baseG) > 0 ? clamp(1 - average(series.P_G) / average(baseG), 0, 1) : 0
  const actualPvReduction = average(basePV) > 0 ? clamp(1 - average(series.P_PV) / average(basePV), 0, 1) : 0

  return {
    labels,
    points,
    series,
    summary: {
      peakGrid: round(maxValue(series.P_G), 2),
      peakPEM: round(maxValue(series.P_PEM), 2),
      peakGM: round(maxValue(series.P_GM), 2),
      peakStorage: round(maxValue(series.P_es_es), 2),
      maxGap: round(maxValue(series.gap), 2),
    },
    priorityOrder: outline.priorityOrder,
    keyAnchors: outline.keyAnchors,
    explanation: outline.explanation,
    meta: {
      generationMode: options.strict ? 'explicit-parameter-fallback' : 'parameter-driven',
      parameterSummary: spec.parameterSummary,
      parameterSource: spec.parameterSource,
      requestedReductions: {
        gridReduction: round(spec.gridReduction, 4),
        pvReduction: round(spec.pvReduction, 4),
      },
      actualReductions: {
        gridReduction: round(actualGridReduction, 4),
        pvReduction: round(actualPvReduction, 4),
      },
      responseWindowHours: spec.durationHours || WINDOW_HOURS,
      validationMessage: options.validationMessage || '',
    },
  }
}

function validateDispatch(detail, context, spec) {
  const required = ['P_CA', 'P_PV', 'P_GM', 'P_PEM', 'P_G', 'P_es_es', 'gap']
  for (const key of required) {
    const values = detail.series?.[key]
    if (!Array.isArray(values) || values.length !== STEPS) return { valid: false, reason: `missing_${key}` }
    if (values.some((value) => !Number.isFinite(value) || value < -1e-6)) return { valid: false, reason: `invalid_${key}` }
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
    return { valid: false, reason: 'supply_not_closed' }
  }

  if (spec.gridReduction > 0 && avgBaseGrid > 0) {
    const tolerance = spec.parameterSource?.gridReduction === 'user' ? 0.06 : 0.12
    const allowedAvgMax = avgBaseGrid * (1 - Math.max(0, spec.gridReduction - tolerance))
    const allowedPeakMax = peakBaseGrid * (1 - Math.max(0, spec.gridReduction - tolerance))
    if (avgPlanGrid > allowedAvgMax + 1) return { valid: false, reason: 'grid_mean_not_reduced' }
    if (peakPlanGrid > allowedPeakMax + 1) return { valid: false, reason: 'grid_peak_not_reduced' }
  }

  if (spec.pvReduction > 0 && avgBasePv > 0) {
    const tolerance = spec.parameterSource?.pvReduction === 'user' ? 0.06 : 0.12
    const minExpectedReduction = Math.max(0, spec.pvReduction - tolerance)
    const actualReduction = 1 - avgPlanPv / avgBasePv
    if (actualReduction < minExpectedReduction) return { valid: false, reason: 'pv_not_reduced_enough' }
  }

  const actualGridReduction = avgBaseGrid > 0 ? 1 - avgPlanGrid / avgBaseGrid : 0
  const actualPvReduction = avgBasePv > 0 ? 1 - avgPlanPv / avgBasePv : 0

  if (spec.parameterSource?.gridReduction === 'user' && spec.gridReduction > 0) {
    if (actualGridReduction + 0.06 < spec.gridReduction) return { valid: false, reason: 'grid_user_parameter_deviated' }
  }

  if (spec.parameterSource?.pvReduction === 'user' && spec.pvReduction > 0 && avgBasePv > 0) {
    if (actualPvReduction + 0.06 < spec.pvReduction) return { valid: false, reason: 'pv_user_parameter_deviated' }
  }

  const internalCompensationInsufficient = detail.points.some((point, index) => {
    const externalLoss = (baseG[index] ?? 0) - (detail.series.P_G[index] ?? 0) + (basePV[index] ?? 0) - (detail.series.P_PV[index] ?? 0)
    const internalGain = (detail.series.P_GM[index] ?? 0) + (detail.series.P_PEM[index] ?? 0) + (detail.series.P_es_es[index] ?? 0)
      - ((baseGM[index] ?? 0) + (basePEM[index] ?? 0) + Math.max(0, baseES[index] ?? 0))
    return externalLoss > Math.max(0, internalGain) + 1 && point.gap > 0
  })

  if (internalCompensationInsufficient && avgPlanCA > avgBaseCA + 1) {
    return { valid: false, reason: 'ca_above_baseline_when_supply_insufficient' }
  }

  return { valid: true }
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
      const metrics = ['P_CA', 'P_PV', 'P_GM', 'P_PEM', 'P_G']
      for (const metric of metrics) {
        const original = dataset[metric]?.[strategy]?.[hour] ?? 0
        const delta = (hourlyEmergency[metric][offset] ?? original) - (selectedBase[metric][hour] ?? 0)
        const next = clamp(original + delta, 0, Math.max(original * 1.6, (hourlyEmergency[metric][offset] ?? 0) * 1.15, 1))
        dataset[metric][strategy][hour] = round(next, 4)
      }
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

export async function createEmergencyDispatch(payload = {}, options = {}) {
  const source = payload.source || 'manual'
  const baseline = resolveBaselineInput(payload)
  if (!baseline?.data) throw new Error('无法解析应急调度基线数据')

  const activeStrategy = payload.activeStrategy || 'es'
  const baselineMeta = baseline.meta || {}
  const viewDate = baselineMeta.viewDate || getBeijingDate()
  const eventSpec = normalizeEventSpec(payload.eventSpec, payload.prompt || '')
  const outline = await planEmergencyOutline(eventSpec, {
    baselineDataset: baseline.data,
    activeStrategy,
  }, options.planner)

  let detail = buildDeterministicDispatch({
    baselineDataset: baseline.data,
    activeStrategy,
    viewDate,
  }, eventSpec, outline)

  let degraded = outline.degraded
  const validation = validateDispatch(detail, {
    baselineDataset: baseline.data,
    activeStrategy,
  }, eventSpec)

  if (!validation.valid) {
    detail = buildDeterministicDispatch({
      baselineDataset: baseline.data,
      activeStrategy,
      viewDate,
    }, eventSpec, buildFallbackOutline(eventSpec, validation.reason), {
      strict: true,
      validationMessage: validation.reason,
    })
    degraded = true
  }

  const db = getDb()
  const baselineDatasetId = baselineMeta.datasetId ?? payload.baselineDatasetId ?? null
  const emergencyDataset = buildEmergencyDataset({
    baselineDataset: baseline.data,
    activeStrategy,
    viewDate,
  }, detail, eventSpec, {
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
  pushServerLog({
    level: degraded ? 'warn' : 'ok',
    status: 'done',
    scope: 'emergency',
    message: `${source === 'auto' ? '自动' : '手动'}应急预案已生成`,
    targetDate: viewDate,
    algorithm: degraded ? 'Emergency explicit-parameter fallback' : 'Emergency parameter-driven dispatch',
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
    baselineDataset: baseline,
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
