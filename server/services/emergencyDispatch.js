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

function parsePromptToEventSpec(prompt = '') {
  const text = String(prompt).trim()
  const affectedModules = new Set()
  const spec = {
    type: 'grid_fault_or_limit',
    title: '应急调度预案',
    severity: 'critical',
    startHour: new Date().getHours(),
    durationHours: WINDOW_HOURS,
    pvReduction: 0,
    gridReduction: 0,
    priceMultiplier: 1,
    carbonMultiplier: 1,
    weatherNote: '',
    affectedModules: [],
    rawPrompt: text,
  }

  if (/台风|暴雨|恶劣天气|强对流/.test(text)) {
    spec.type = 'typhoon_weather'
    spec.title = '台风天气应急调度'
    spec.weatherNote = '天气恶化导致光伏和外部供能波动'
    spec.pvReduction = Math.max(spec.pvReduction, 0.45)
    affectedModules.add('pv')
    affectedModules.add('grid')
  }

  if (/电网.*故障|购电.*下降|电网.*下降|限电|电网受限/.test(text)) {
    spec.type = spec.type === 'typhoon_weather' ? 'typhoon_weather' : 'grid_fault_or_limit'
    spec.title = spec.title === '应急调度预案' ? '电网故障应急调度' : spec.title
    spec.gridReduction = Math.max(spec.gridReduction, 0.5)
    affectedModules.add('grid')
    affectedModules.add('gm')
    affectedModules.add('pem')
    affectedModules.add('es')
  }

  if (/光伏.*下降|光照.*下降|辐照.*下降|云层/.test(text)) {
    if (spec.type === 'grid_fault_or_limit' && !/台风|暴雨|恶劣天气|强对流/.test(text)) {
      spec.type = 'pv_drop'
      spec.title = '光伏突降应急调度'
    }
    spec.pvReduction = Math.max(spec.pvReduction, 0.4)
    affectedModules.add('pv')
  }

  if (/电价.*飙升|价格.*飙升|现货.*高/.test(text)) {
    spec.priceMultiplier = 1.45
    affectedModules.add('market')
  }

  if (/碳因子.*高|碳排.*高|高碳/.test(text)) {
    spec.carbonMultiplier = 1.3
    affectedModules.add('carbon')
  }

  spec.affectedModules = [...affectedModules]
  return spec
}

function normalizeEventSpec(input, prompt = '') {
  const base = parsePromptToEventSpec(prompt)
  const spec = { ...base, ...(input || {}) }
  spec.title = spec.title || base.title
  spec.type = spec.type || base.type
  spec.severity = spec.severity || 'critical'
  spec.startHour = clamp(toNumber(spec.startHour, base.startHour), 0, 23)
  spec.durationHours = WINDOW_HOURS
  spec.pvReduction = clamp(toNumber(spec.pvReduction, base.pvReduction), 0, 0.9)
  spec.gridReduction = clamp(toNumber(spec.gridReduction, base.gridReduction), 0, 0.95)
  spec.priceMultiplier = Math.max(1, toNumber(spec.priceMultiplier, base.priceMultiplier))
  spec.carbonMultiplier = Math.max(1, toNumber(spec.carbonMultiplier, base.carbonMultiplier))
  spec.weatherNote = String(spec.weatherNote || base.weatherNote || '')
  spec.affectedModules = Array.isArray(spec.affectedModules) && spec.affectedModules.length
    ? spec.affectedModules
    : base.affectedModules
  spec.rawPrompt = String(spec.rawPrompt || prompt || '')
  return spec
}

function buildFallbackOutline(spec) {
  const priorityOrder = spec.gridReduction > 0
    ? ['P_PV', 'P_es_es', 'P_PEM', 'P_GM', 'P_G']
    : ['P_PV', 'P_G', 'P_es_es', 'P_PEM', 'P_GM']

  const keyAnchors = [
    spec.gridReduction > 0 ? '限制电网购电上限，优先调用园区内部灵活资源补缺口' : '电网维持兜底供能',
    spec.pvReduction > 0 ? '光伏按事件降额，避免沿用正常天气假设' : '光伏维持基线出力',
    '储能和 PEM 作为首轮快速响应资源，燃机承担持续补偿',
    '当局部缺口仍存在时，适度下调电解槽负荷，确保保供优先',
  ]

  const explanation = spec.type === 'typhoon_weather'
    ? '已按台风天气与外部供能受损场景生成 4 小时应急调度。策略先压低光伏和购电能力，再由储能、PEM、燃机接力补偿，必要时对电解槽进行温和降载。'
    : '已按突发供能受限场景生成 4 小时应急调度。策略优先保证关键负荷，其次使用园区内部灵活资源补偿缺口，并控制风险扩散。'

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
    return {
      priorityOrder: Array.isArray(result?.priorityOrder) && result.priorityOrder.length
        ? result.priorityOrder
        : buildFallbackOutline(spec).priorityOrder,
      keyAnchors: Array.isArray(result?.keyAnchors) && result.keyAnchors.length
        ? result.keyAnchors
        : buildFallbackOutline(spec).keyAnchors,
      explanation: String(result?.explanation || buildFallbackOutline(spec).explanation),
      degraded: false,
    }
  } catch {
    return buildFallbackOutline(spec)
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

function buildDeterministicDispatch(context, spec, outline) {
  const { activeStrategy, baselineDataset, viewDate } = context
  const startHour = spec.startHour
  const baseCA = interpolateHourlyWindow(baselineDataset.P_CA?.[activeStrategy], startHour)
  const basePV = interpolateHourlyWindow(baselineDataset.P_PV?.[activeStrategy], startHour)
  const baseGM = interpolateHourlyWindow(baselineDataset.P_GM?.[activeStrategy], startHour)
  const basePEM = interpolateHourlyWindow(baselineDataset.P_PEM?.[activeStrategy], startHour)
  const baseG = interpolateHourlyWindow(baselineDataset.P_G?.[activeStrategy], startHour)
  const baseES = interpolateHourlyWindow(baselineDataset.P_es_es, startHour)

  const gmCap = Math.max(...baseGM, 520) * 1.35
  const pemCap = Math.max(...basePEM, 240) * 1.45
  const gridBaseCap = Math.max(...baseG, 1800)
  const esPowerMax = Math.max(...baseES, 420) * 1.25
  let esEnergyRemain = esPowerMax * 2.2

  const ramp = { gm: 28, pem: 40, grid: 120, es: 70, ca: 45 }
  let prev = {
    P_CA: baseCA[0] ?? 0,
    P_GM: Math.min(baseGM[0] ?? 0, gmCap),
    P_PEM: Math.min(basePEM[0] ?? 0, pemCap),
    P_G: Math.min(baseG[0] ?? 0, gridBaseCap),
    P_es_es: 0,
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
    const demandBase = baseCA[i] ?? prev.P_CA
    const pvBase = basePV[i] ?? 0
    const pv = clamp(pvBase * (1 - spec.pvReduction), 0, pvBase)
    const gridCap = clamp((baseG[i] ?? gridBaseCap) * (1 - spec.gridReduction), 120, gridBaseCap)
    const caTarget = demandBase * (spec.gridReduction > 0.35 ? 0.96 : 0.99)
    let pCA = applyRamp(caTarget, prev.P_CA, ramp.ca, demandBase * 1.02)

    let remaining = Math.max(0, pCA - pv)
    let pGrid = applyRamp(Math.min(gridCap, remaining * 0.22), prev.P_G, ramp.grid, gridCap)
    remaining -= pGrid

    const esCapNow = Math.min(esPowerMax, esEnergyRemain * (60 / STEP_MINUTES))
    let pES = applyRamp(Math.min(esCapNow, remaining * 0.48), prev.P_es_es, ramp.es, esCapNow)
    remaining -= pES
    esEnergyRemain = Math.max(0, esEnergyRemain - pES * (STEP_MINUTES / 60))

    let pPEM = applyRamp(Math.min(pemCap, remaining * 0.72), prev.P_PEM, ramp.pem, pemCap)
    remaining -= pPEM

    let pGM = applyRamp(Math.min(gmCap, remaining), prev.P_GM, ramp.gm, gmCap)
    remaining -= pGM

    if (remaining > 0) {
      const gridHeadroom = Math.max(0, gridCap - pGrid)
      const addGrid = Math.min(gridHeadroom, remaining)
      pGrid += addGrid
      remaining -= addGrid
    }

    if (remaining > 0) {
      pCA = Math.max(0, pCA - remaining)
    }

    const totalSupply = pv + pGrid + pES + pPEM + pGM
    const gap = round(pCA - totalSupply, 4)
    const riskLevel = gap > 120 ? 'high' : gap > 25 ? 'medium' : 'low'
    const time = makeTimeLabel(viewDate, startHour, i)

    labels.push(time.label)
    series.P_CA.push(round(pCA, 4))
    series.P_PV.push(round(pv, 4))
    series.P_G.push(round(pGrid, 4))
    series.P_es_es.push(round(pES, 4))
    series.P_PEM.push(round(pPEM, 4))
    series.P_GM.push(round(pGM, 4))
    series.gap.push(gap)
    points.push({
      index: i,
      label: time.label,
      timestamp: time.timestamp,
      P_CA: round(pCA, 4),
      P_PV: round(pv, 4),
      P_G: round(pGrid, 4),
      P_es_es: round(pES, 4),
      P_PEM: round(pPEM, 4),
      P_GM: round(pGM, 4),
      supplyTotal: round(totalSupply, 4),
      gap,
      riskLevel,
    })

    prev = { P_CA: pCA, P_G: pGrid, P_es_es: pES, P_PEM: pPEM, P_GM: pGM }
  }

  const summary = {
    peakGrid: round(Math.max(...series.P_G), 2),
    peakPEM: round(Math.max(...series.P_PEM), 2),
    peakGM: round(Math.max(...series.P_GM), 2),
    peakStorage: round(Math.max(...series.P_es_es), 2),
    maxGap: round(Math.max(...series.gap), 2),
  }

  return {
    labels,
    points,
    series,
    summary,
    priorityOrder: outline.priorityOrder,
    keyAnchors: outline.keyAnchors,
    explanation: outline.explanation,
  }
}

function validateDispatch(detail) {
  const required = ['P_CA', 'P_PV', 'P_GM', 'P_PEM', 'P_G', 'P_es_es', 'gap']
  for (const key of required) {
    const values = detail.series?.[key]
    if (!Array.isArray(values) || values.length !== STEPS) return false
    if (values.some((value) => !Number.isFinite(value) || value < -1e-6)) return false
  }
  return detail.points.every((point) => point.gap <= 180)
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
        const next = clamp(original + delta, 0, Math.max(original * 1.6, hourlyEmergency[metric][offset] * 1.15, 1))
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
  if (!baseline?.data) {
    throw new Error('无法解析应急调度基线数据')
  }

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
  if (!validateDispatch(detail)) {
    detail = buildDeterministicDispatch({
      baselineDataset: baseline.data,
      activeStrategy,
      viewDate,
    }, eventSpec, buildFallbackOutline(eventSpec))
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

  const explanation = detail.explanation
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
    explanation,
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
    algorithm: degraded ? 'Emergency template dispatch' : 'Emergency AI dispatch',
    detail: `${eventSpec.title} | datasetId ${emergencyDatasetId}`,
  })

  const serialized = serializeRun(created, { includeDatasets: true })
  if (options.broadcast !== false) {
    broadcastEmergencyPlanCreated(serialized)
  }
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

