import {
  createAnomalyRun,
  getAnomalyRunById,
  getDatasetById,
  getDb,
  getDefaultDataset,
  getLatestAppliedAnomalyRun,
  listAnomalyRuns,
  updateAnomalyRun,
} from '../db/index.js'
import { formatBeijingDateTime, getBeijingDate } from '../lib/time.js'
import { pushServerLog } from '../ws.js'

const STRATEGIES = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']
const STEP_MINUTES = 5
const STEPS = 48
const WINDOW_HOURS = 4

const DEVICE_LIBRARY = {
  gm: {
    label: '燃气轮机',
    indicator: 'temperature',
    unit: '°C',
    threshold: 690,
    anomalyType: '温度过高',
    severity: 'critical',
  },
  pem: {
    label: 'PEM',
    indicator: 'pressure',
    unit: 'bar',
    threshold: 26,
    anomalyType: '压力异常',
    severity: 'warning',
  },
  ca: {
    label: '电解槽',
    indicator: 'current',
    unit: 'kA',
    threshold: 33,
    anomalyType: '槽电流异常',
    severity: 'critical',
  },
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function ensureArray(value, length = 24, fill = 0) {
  const arr = Array.isArray(value) ? value.map((item) => Number(item) || fill) : []
  if (arr.length >= length) return arr.slice(0, length)
  return [...arr, ...Array.from({ length: length - arr.length }, () => fill)]
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
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

function detectStrategy(dataset, preferred) {
  if (preferred && dataset?.summary?.[preferred]) return preferred
  return STRATEGIES.find((key) => dataset?.summary?.[key]) ?? 'es'
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
  const fallback = getDefaultDataset()
  if (fallback) {
    return {
      data: deepClone(fallback.data),
      meta: fallback.data?._meta || { datasetId: fallback.id, datasetName: fallback.name },
    }
  }
  return null
}

function parseAnomalySpec(prompt = '', eventSpec = {}) {
  const text = String(prompt)
  const requestedDevice = typeof eventSpec.deviceType === 'string' ? eventSpec.deviceType.toLowerCase() : ''
  const deviceType = requestedDevice === 'pem' || requestedDevice === 'ca' || requestedDevice === 'gm'
    ? requestedDevice
    : /pem/i.test(text)
      ? 'pem'
      : /电解槽|槽压|槽电流/i.test(text)
        ? 'ca'
        : 'gm'
  const library = DEVICE_LIBRARY[deviceType]
  const severity = /严重|高危|critical|紧急/i.test(text) ? 'critical' : (eventSpec.severity || library.severity)
  const anomalyType = /压力/i.test(text)
    ? '压力异常'
    : /功率|衰减/i.test(text)
      ? '功率衰减'
      : library.anomalyType

  const observedIndicators = [
    {
      name: library.indicator,
      unit: library.unit,
      threshold: library.threshold,
      current: library.threshold * 1.18,
    },
  ]

  return {
    title: `${library.label}${anomalyType}指挥方案`,
    deviceType,
    anomalyType,
    severity,
    startHour: Number(eventSpec.startHour) || new Date().getHours(),
    durationHours: Number(eventSpec.durationHours) || WINDOW_HOURS,
    triggerSource: eventSpec.triggerSource || 'demo_injection',
    observedIndicators,
    dispatchGoal: eventSpec.dispatchGoal || '隔离异常设备并联动其他设备补偿，维持供能闭合',
    rawPrompt: text,
  }
}

function noise(seed, step, amplitude) {
  const value = Math.sin(seed * 0.73 + step * 0.61) + Math.cos(seed * 0.37 + step * 1.19)
  return round(value * amplitude * 0.5, 3)
}

function stageFactor(step) {
  const ratio = step / Math.max(STEPS - 1, 1)
  if (ratio < 0.18) return ratio / 0.18 * 0.36
  if (ratio < 0.52) return 0.36 + ((ratio - 0.18) / 0.34) * 0.42
  if (ratio < 0.82) return 0.78 + ((ratio - 0.52) / 0.3) * 0.17
  return 0.95 + ((ratio - 0.82) / 0.18) * 0.05
}

function buildAnomalyDetail(context, spec) {
  const { baselineDataset, activeStrategy, viewDate } = context
  const startHour = spec.startHour
  const base = {
    P_CA: interpolateHourlyWindow(baselineDataset.P_CA?.[activeStrategy], startHour),
    P_PV: interpolateHourlyWindow(baselineDataset.P_PV?.[activeStrategy], startHour),
    P_GM: interpolateHourlyWindow(baselineDataset.P_GM?.[activeStrategy], startHour),
    P_PEM: interpolateHourlyWindow(baselineDataset.P_PEM?.[activeStrategy], startHour),
    P_G: interpolateHourlyWindow(baselineDataset.P_G?.[activeStrategy], startHour),
    P_es_es: interpolateHourlyWindow(baselineDataset.P_es_es, startHour),
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
  const indicatorSeries = []
  const labels = []
  const points = []
  const affected = spec.deviceType === 'gm' ? 'P_GM' : spec.deviceType === 'pem' ? 'P_PEM' : 'P_CA'
  const indicatorBase = spec.deviceType === 'gm' ? 635 : spec.deviceType === 'pem' ? 22 : 29
  const targetDrop = spec.deviceType === 'gm' ? 0.62 : spec.deviceType === 'pem' ? 0.55 : 0.42
  const gmLift = spec.deviceType === 'gm' ? 0.08 : 0.42
  const pemLift = spec.deviceType === 'pem' ? 0.08 : 0.34
  const storageLift = spec.deviceType === 'ca' ? 0.46 : 0.38
  const gridLift = spec.deviceType === 'gm' ? 0.26 : spec.deviceType === 'pem' ? 0.18 : 0.1
  const caDrop = spec.deviceType === 'ca' ? targetDrop : 0.18

  for (let i = 0; i < STEPS; i += 1) {
    const factor = stageFactor(i)
    const time = makeTimeLabel(viewDate, startHour, i)
    labels.push(time.label)

    const targetAffected = base[affected][i] * (1 - targetDrop * factor)
    const nextGM = base.P_GM[i] * (1 + gmLift * factor) + noise(11, i, 18)
    const nextPEM = base.P_PEM[i] * (1 + pemLift * factor) + noise(17, i, 10)
    const nextES = Math.max(0, base.P_es_es[i] * (1 + storageLift * factor) + 120 * factor + noise(23, i, 16))
    const nextGrid = base.P_G[i] * (1 + gridLift * factor) + noise(29, i, 35)
    const nextCA = base.P_CA[i] * (1 - caDrop * factor) + noise(31, i, 26)

    series.P_GM.push(round(affected === 'P_GM' ? targetAffected : nextGM, 2))
    series.P_PEM.push(round(affected === 'P_PEM' ? targetAffected : nextPEM, 2))
    series.P_es_es.push(round(nextES, 2))
    series.P_G.push(round(nextGrid, 2))
    series.P_CA.push(round(affected === 'P_CA' ? targetAffected : nextCA, 2))
    series.P_PV.push(round(Math.max(0, base.P_PV[i] + noise(37, i, 8)), 2))

    const supplyTotal = series.P_PV[i] + series.P_GM[i] + series.P_PEM[i] + series.P_G[i] + series.P_es_es[i]
    const gap = Math.max(0, series.P_CA[i] - supplyTotal)
    series.gap.push(round(gap, 2))

    points.push({
      index: i,
      label: time.label,
      timestamp: time.timestamp,
      P_CA: series.P_CA[i],
      P_PV: series.P_PV[i],
      P_GM: series.P_GM[i],
      P_PEM: series.P_PEM[i],
      P_G: series.P_G[i],
      P_es_es: series.P_es_es[i],
      supplyTotal: round(supplyTotal, 2),
      gap: round(gap, 2),
      riskLevel: i < 12 ? 'high' : i < 30 ? 'medium' : 'low',
    })

    indicatorSeries.push({
      label: time.label,
      timestamp: time.timestamp,
      name: spec.observedIndicators[0].name,
      unit: spec.observedIndicators[0].unit,
      value: round(indicatorBase + factor * spec.observedIndicators[0].threshold * 0.28 + noise(47, i, 2.4), 2),
      threshold: spec.observedIndicators[0].threshold,
    })
  }

  return {
    labels,
    series,
    points,
    baselineSeries: base,
    indicatorSeries,
    summary: {
      deviceType: spec.deviceType,
      anomalyType: spec.anomalyType,
      severity: spec.severity,
      peakGap: round(Math.max(...series.gap), 2),
      affectedDrop: round(targetDrop * 100, 1),
      gmLift: round(gmLift * 100, 1),
      pemLift: round(pemLift * 100, 1),
      storageLift: round(storageLift * 100, 1),
    },
    timeline: [
      { time: labels[0], title: '异常触发', detail: `${DEVICE_LIBRARY[spec.deviceType].label}${spec.anomalyType}被注入并锁定观察。`, severity: 'critical', action: '切换至异常指挥模式' },
      { time: labels[6], title: '设备降载', detail: '异常设备开始降载，限制故障扩散。', severity: 'warning', action: '执行降载边界' },
      { time: labels[14], title: '协同补偿', detail: '其余设备逐步抬升，补齐供能缺口。', severity: 'warning', action: '联动燃机 / PEM / 储能' },
      { time: labels[28], title: '稳态压制', detail: '维持异常设备隔离，保留应急冗余。', severity: 'info', action: '维持支撑与监测' },
    ],
    riskMatrix: ['燃机', 'PEM', '电解槽', '储能'].flatMap((module, rowIndex) => (
      ['00:00-01:00', '01:00-02:00', '02:00-03:00', '03:00-04:00'].map((windowLabel, colIndex) => ({
        module,
        windowLabel,
        level: rowIndex === 0 && spec.deviceType === 'gm'
          ? 'high'
          : rowIndex === 1 && spec.deviceType === 'pem'
            ? 'high'
            : rowIndex === 2 && spec.deviceType === 'ca'
              ? 'high'
              : colIndex < 2 ? 'medium' : 'low',
        score: rowIndex === 0 && spec.deviceType === 'gm'
          ? 82 - colIndex * 8
          : rowIndex === 1 && spec.deviceType === 'pem'
            ? 78 - colIndex * 7
            : rowIndex === 2 && spec.deviceType === 'ca'
              ? 84 - colIndex * 7
              : 46 + colIndex * 4,
        reason: `${module}在${windowLabel}承担异常联动调节`,
      }))
    )),
    moduleStatus: [
      {
        module: DEVICE_LIBRARY[spec.deviceType].label,
        level: 'red',
        title: spec.anomalyType,
        detail: '当前指标越过阈值，设备处于受限运行状态。',
        suggestion: '继续降载并保持隔离监测',
        currentValue: indicatorSeries[indicatorSeries.length - 1].value,
        unit: spec.observedIndicators[0].unit,
      },
      {
        module: '燃机',
        level: spec.deviceType === 'gm' ? 'amber' : 'green',
        title: spec.deviceType === 'gm' ? '自身受限' : '补偿支撑',
        detail: spec.deviceType === 'gm' ? '异常期间保持热备份边界。' : '提高出力承担补偿任务。',
        suggestion: spec.deviceType === 'gm' ? '避免二次升载' : '维持补偿输出',
        currentValue: series.P_GM[series.P_GM.length - 1],
        unit: 'kW',
      },
      {
        module: 'PEM',
        level: spec.deviceType === 'pem' ? 'amber' : 'green',
        title: spec.deviceType === 'pem' ? '自身受限' : '补偿支撑',
        detail: spec.deviceType === 'pem' ? '异常期间限制负荷波动。' : '承担内部支撑任务。',
        suggestion: spec.deviceType === 'pem' ? '限制功率跳变' : '维持堆栈输出',
        currentValue: series.P_PEM[series.P_PEM.length - 1],
        unit: 'kW',
      },
      {
        module: '储能',
        level: 'green',
        title: '应急支撑',
        detail: '储能参与平衡缺口并抑制扰动。',
        suggestion: '维持快速调节窗口',
        currentValue: series.P_es_es[series.P_es_es.length - 1],
        unit: 'kW',
      },
    ],
    actions: [
      '识别异常指标并锁定告警边界',
      '对异常设备执行渐进式降载',
      '联动燃机、PEM、储能抬升补偿',
      '保持供能闭合并持续观察阈值回落',
    ],
    explanation: `${DEVICE_LIBRARY[spec.deviceType].label}${spec.anomalyType}场景下，系统优先压制异常设备风险，再联动其他设备补偿供能，保证评委可以清晰看到“异常设备降载 + 其他设备补偿”的全过程。`,
  }
}

function buildAnomalyDataset(context, detail, spec, runMeta = {}) {
  const dataset = deepClone(context.baselineDataset)
  const averaged = (key) => {
    const out = []
    for (let i = 0; i < detail.series[key].length; i += 12) {
      const chunk = detail.series[key].slice(i, i + 12)
      out.push(round(chunk.reduce((sum, value) => sum + value, 0) / Math.max(chunk.length, 1), 4))
    }
    return out
  }
  const hourly = {
    P_CA: averaged('P_CA'),
    P_PV: averaged('P_PV'),
    P_GM: averaged('P_GM'),
    P_PEM: averaged('P_PEM'),
    P_G: averaged('P_G'),
    P_es_es: averaged('P_es_es'),
  }

  for (const strategy of STRATEGIES) {
    for (let offset = 0; offset < hourly.P_CA.length; offset += 1) {
      const hour = clamp(spec.startHour + offset, 0, 23)
      dataset.P_CA[strategy][hour] = hourly.P_CA[offset]
      dataset.P_PV[strategy][hour] = hourly.P_PV[offset]
      dataset.P_GM[strategy][hour] = hourly.P_GM[offset]
      dataset.P_PEM[strategy][hour] = hourly.P_PEM[offset]
      dataset.P_G[strategy][hour] = hourly.P_G[offset]
    }
  }

  for (let offset = 0; offset < hourly.P_es_es.length; offset += 1) {
    const hour = clamp(spec.startHour + offset, 0, 23)
    dataset.P_es_es[hour] = hourly.P_es_es[offset]
  }

  dataset._meta = {
    ...(dataset._meta || {}),
    datasetType: 'anomaly',
    viewDate: context.viewDate,
    snapshotAt: formatBeijingDateTime(),
    isHistorical: false,
    anomalyRunId: runMeta.anomalyRunId ?? null,
    anomalyActive: Boolean(runMeta.anomalyActive),
    anomalyTitle: spec.title,
  }
  return dataset
}

function serializeRun(row, { includeDatasets = false } = {}) {
  if (!row) return null
  const run = {
    id: row.id,
    title: row.title,
    source: row.source,
    severity: row.severity,
    status: row.status,
    baselineDatasetId: row.baseline_dataset_id ?? null,
    anomalyDatasetId: row.anomaly_dataset_id ?? null,
    eventSpec: row.event_spec,
    detailPayload: row.detail_payload,
    explanation: row.explanation ?? row.detail_payload?.explanation ?? '',
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    restoredAt: row.restored_at,
    baselinePayload: row.baseline_payload ?? null,
  }

  if (includeDatasets) {
    const anomalyDataset = row.anomaly_dataset_id ? getDatasetById(row.anomaly_dataset_id) : null
    const baselineDataset = row.baseline_dataset_id ? getDatasetById(row.baseline_dataset_id) : null
    run.anomalyDataset = anomalyDataset
      ? { id: anomalyDataset.id, name: anomalyDataset.name, data: anomalyDataset.data, meta: anomalyDataset.data?._meta || {} }
      : null
    run.baselineDataset = baselineDataset
      ? { id: baselineDataset.id, name: baselineDataset.name, data: baselineDataset.data, meta: baselineDataset.data?._meta || {} }
      : row.baseline_payload ?? null
  }

  return run
}

export function listSerializedAnomalyRuns(limit = 20) {
  return listAnomalyRuns(limit).map((row) => serializeRun(row, { includeDatasets: true }))
}

export function getSerializedAnomalyRun(id) {
  return serializeRun(getAnomalyRunById(id), { includeDatasets: true })
}

export async function createAnomalyDispatch(payload = {}) {
  const baseline = resolveBaselineInput(payload)
  if (!baseline?.data) throw new Error('无法解析设备异常基线数据')

  const activeStrategy = detectStrategy(baseline.data, payload.activeStrategy)
  const viewDate = baseline.meta?.viewDate || getBeijingDate()
  const spec = parseAnomalySpec(payload.prompt, payload.eventSpec)
  const context = {
    baselineDataset: baseline.data,
    activeStrategy,
    viewDate,
  }

  const detail = buildAnomalyDetail(context, spec)
  const anomalyDataset = buildAnomalyDataset(context, detail, spec, { anomalyActive: false })
  const datasetName = `${spec.title} ${formatBeijingDateTime()}`
  const datasetInfo = getDb().prepare('INSERT INTO datasets (name, data) VALUES (?, ?)').run(datasetName, JSON.stringify(anomalyDataset))
  const anomalyDatasetId = Number(datasetInfo.lastInsertRowid)
  anomalyDataset._meta = {
    ...anomalyDataset._meta,
    datasetId: anomalyDatasetId,
    datasetName,
  }
  getDb().prepare('UPDATE datasets SET data = ? WHERE id = ?').run(JSON.stringify(anomalyDataset), anomalyDatasetId)

  const runId = createAnomalyRun({
    title: spec.title,
    source: payload.source || 'manual',
    severity: spec.severity,
    status: 'planned',
    baseline_dataset_id: baseline.meta?.datasetId ?? payload.baselineDatasetId ?? null,
    anomaly_dataset_id: anomalyDatasetId,
    baseline_payload: baseline.meta?.datasetId ? null : baseline,
    event_spec: spec,
    detail_payload: detail,
    explanation: detail.explanation,
  })

  anomalyDataset._meta = {
    ...anomalyDataset._meta,
    anomalyRunId: runId,
  }
  getDb().prepare('UPDATE datasets SET data = ? WHERE id = ?').run(JSON.stringify(anomalyDataset), anomalyDatasetId)

  pushServerLog({
    level: 'warn',
    status: 'done',
    scope: 'anomaly',
    message: '设备异常指挥方案已生成',
    targetDate: viewDate,
    algorithm: 'Anomaly Dispatch Engine',
    detail: `${spec.title} | ${spec.deviceType} | ${spec.anomalyType}`,
  })

  return serializeRun(getAnomalyRunById(runId), { includeDatasets: true })
}

export function applyAnomalyRun(id) {
  const row = getAnomalyRunById(id)
  if (!row) throw new Error('异常方案不存在')
  if (!row.anomaly_dataset_id) throw new Error('异常方案缺少调度数据集')
  const dataset = getDatasetById(row.anomaly_dataset_id)
  if (!dataset) throw new Error('异常数据集不存在')

  const meta = {
    ...(dataset.data?._meta || {}),
    datasetType: 'anomaly',
    datasetId: dataset.id,
    datasetName: dataset.name,
    anomalyRunId: row.id,
    anomalyActive: true,
    anomalyTitle: row.title,
  }
  const nextData = { ...dataset.data, _meta: meta }
  getDb().prepare('UPDATE datasets SET data = ? WHERE id = ?').run(JSON.stringify(nextData), dataset.id)

  const updated = updateAnomalyRun(id, {
    status: 'applied',
    applied_at: formatBeijingDateTime(),
    restored_at: null,
  })
  return {
    run: serializeRun(updated, { includeDatasets: true }),
    dataset: { id: dataset.id, name: dataset.name, data: nextData, meta },
  }
}

export function restoreAnomalyState(runId = null) {
  const row = runId ? getAnomalyRunById(runId) : getLatestAppliedAnomalyRun()
  if (!row) throw new Error('当前没有可恢复的异常方案')

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

  const updated = updateAnomalyRun(row.id, {
    status: 'restored',
    restored_at: formatBeijingDateTime(),
  })
  return {
    run: serializeRun(updated, { includeDatasets: true }),
    baselineDataset: {
      ...baseline,
      meta: {
        ...(baseline.meta || {}),
        anomalyActive: false,
        anomalyRunId: null,
        anomalyTitle: '',
      },
    },
  }
}
