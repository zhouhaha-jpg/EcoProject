import {
  createInvestmentRun,
  getDatasetById,
  getDefaultDataset,
  getDb,
  getInvestmentRunById,
  listInvestmentRuns,
} from '../db/index.js'
import { formatBeijingDateTime, getBeijingDate } from '../lib/time.js'
import { pushServerLog } from '../ws.js'

const DEFAULT_ASSUMPTIONS = {
  capexPerModule: 980,
  opexRate: 0.018,
  annualDegradation: 0.006,
  lifespanYears: 20,
  carbonPrice: 90,
  discountRate: 0,
  inverterReserveFactor: 0.96,
}

const STRATEGY_PRIORITY = ['es', 'cicom', 'cicar', 'cicos', 'pv', 'uci']

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function average(values = []) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function detectStrategy(dataset, preferred) {
  if (preferred && dataset?.summary?.[preferred]) return preferred
  return STRATEGY_PRIORITY.find((key) => dataset?.summary?.[key]) ?? 'es'
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

function parseModuleCounts(prompt = '') {
  const text = String(prompt)
  const pairMatch = text.match(/(?:从|由)\s*(\d{3,6})\s*(?:增加|提升|扩容|扩大|扩建|增至|到)\s*(\d{3,6})/i)
  if (pairMatch) {
    return {
      currentModules: Number(pairMatch[1]),
      targetModules: Number(pairMatch[2]),
    }
  }

  const targetMatch = text.match(/(?:增加到|提升到|扩容到|扩建到|增至|变为)\s*(\d{3,6})/i)
  if (targetMatch) {
    return {
      currentModules: 2000,
      targetModules: Number(targetMatch[1]),
    }
  }

  return {
    currentModules: 2000,
    targetModules: 5000,
  }
}

function readRealtimeFactors(viewDate) {
  const date = viewDate || getBeijingDate()
  const rows = getDb()
    .prepare('SELECT hour, price_grid, ef_grid FROM realtime_data WHERE data_date = ? ORDER BY hour')
    .all(date)

  if (!rows.length) {
    return {
      avgGridPrice: 0.62,
      avgCarbonFactor: 0.00058,
    }
  }

  return {
    avgGridPrice: average(rows.map((row) => Number(row.price_grid) || 0.62)),
    avgCarbonFactor: average(rows.map((row) => Number(row.ef_grid) || 0.00058)),
  }
}

function computePaybackYear(cumulativeSeries) {
  const positiveIndex = cumulativeSeries.findIndex((item) => item.cumulativeCashflow >= 0)
  if (positiveIndex <= 0) return positiveIndex === 0 ? 1 : null
  const prev = cumulativeSeries[positiveIndex - 1]
  const curr = cumulativeSeries[positiveIndex]
  const delta = curr.cumulativeCashflow - prev.cumulativeCashflow
  if (delta <= 0) return curr.year
  const fraction = Math.abs(prev.cumulativeCashflow) / delta
  return round(prev.year + fraction, 1)
}

function buildReport(summary, assumptions) {
  const payback = summary.paybackYears == null ? '超过测算寿命' : `${summary.paybackYears} 年`
  return [
    `本次测算假设光伏组件由 ${summary.currentModules} 组扩容到 ${summary.targetModules} 组，新增 ${summary.deltaModules} 组。`,
    `在当前园区电价和碳价口径下，新增装机预计每年带来约 ${summary.annualSavings.toLocaleString('zh-CN')} 元节省，以及 ${summary.annualCarbonRevenue.toLocaleString('zh-CN')} 元碳收益。`,
    `按默认 CAPEX ${assumptions.capexPerModule} 元/组、运维率 ${(assumptions.opexRate * 100).toFixed(1)}%、衰减 ${(assumptions.annualDegradation * 100).toFixed(1)}% 计算，静态回本期约为 ${payback}。`,
    '收益主因来自购电替代，其次是碳收益；敏感因子主要是峰谷电价差、组件单价和日照利用率。',
  ].join('\n')
}

function serializeRun(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    baselineDatasetId: row.baseline_dataset_id ?? null,
    payload: row.plan_payload,
    explanation: row.explanation ?? row.plan_payload?.report ?? '',
    createdAt: row.created_at,
  }
}

export function listSerializedInvestmentRuns(limit = 20) {
  return listInvestmentRuns(limit).map(serializeRun)
}

export function getSerializedInvestmentRun(id) {
  return serializeRun(getInvestmentRunById(id))
}

export async function createInvestmentPlan(payload = {}) {
  const baseline = resolveBaselineInput(payload)
  if (!baseline?.data) throw new Error('无法解析投资规划基线数据')

  const prompt = String(payload.prompt || '')
  const strategy = detectStrategy(baseline.data, payload.activeStrategy)
  const viewDate = baseline.meta?.viewDate || getBeijingDate()
  const { currentModules, targetModules } = parseModuleCounts(prompt)
  const deltaModules = Math.max(0, targetModules - currentModules)
  const assumptions = {
    ...DEFAULT_ASSUMPTIONS,
    ...(payload.assumptions || {}),
  }

  const pvSeries = baseline.data?.P_PV?.[strategy] || []
  const currentDailyGeneration = pvSeries.reduce((sum, value) => sum + (Number(value) || 0), 0)
  const perModuleDailyGeneration = currentModules > 0
    ? (currentDailyGeneration / currentModules) * assumptions.inverterReserveFactor
    : 0
  const targetDailyGeneration = perModuleDailyGeneration * targetModules
  const deltaDailyGeneration = perModuleDailyGeneration * deltaModules

  const { avgGridPrice, avgCarbonFactor } = readRealtimeFactors(viewDate)
  const beforeAnnualCost = (baseline.data.summary?.[strategy]?.cost || 0) * 365
  const beforeAnnualCarbon = (baseline.data.summary?.[strategy]?.carbon || 0) * 365
  const additionalCapex = deltaModules * assumptions.capexPerModule

  let cumulativeCashflow = -additionalCapex
  const yearlyCashflow = []
  for (let year = 1; year <= assumptions.lifespanYears; year += 1) {
    const degradationFactor = Math.max(0.72, 1 - assumptions.annualDegradation * (year - 1))
    const annualEnergy = deltaDailyGeneration * 365 * degradationFactor
    const savings = annualEnergy * avgGridPrice
    const carbonRevenue = annualEnergy * avgCarbonFactor * assumptions.carbonPrice
    const opex = additionalCapex * assumptions.opexRate
    const netCashflow = savings + carbonRevenue - opex
    cumulativeCashflow += netCashflow
    yearlyCashflow.push({
      year,
      annualEnergy: round(annualEnergy, 0),
      savings: round(savings, 2),
      carbonRevenue: round(carbonRevenue, 2),
      opex: round(opex, 2),
      netCashflow: round(netCashflow, 2),
      cumulativeCashflow: round(cumulativeCashflow, 2),
    })
  }

  const paybackYears = computePaybackYear(yearlyCashflow)
  const annualSavings = yearlyCashflow[0]?.savings ?? 0
  const annualCarbonRevenue = yearlyCashflow[0]?.carbonRevenue ?? 0
  const annualOpex = yearlyCashflow[0]?.opex ?? 0
  const afterAnnualCost = Math.max(0, beforeAnnualCost - annualSavings + annualOpex)
  const annualCarbonReduction = deltaDailyGeneration * 365 * avgCarbonFactor
  const afterAnnualCarbon = Math.max(0, beforeAnnualCarbon - annualCarbonReduction)

  const summary = {
    currentModules,
    targetModules,
    deltaModules,
    currentDailyGeneration: round(currentDailyGeneration, 1),
    targetDailyGeneration: round(targetDailyGeneration, 1),
    deltaDailyGeneration: round(deltaDailyGeneration, 1),
    additionalCapex: round(additionalCapex, 2),
    annualSavings: round(annualSavings, 2),
    annualCarbonRevenue: round(annualCarbonRevenue, 2),
    annualOpex: round(annualOpex, 2),
    paybackYears,
    viewDate,
    activeStrategy: strategy,
  }

  const beforeAfter = {
    annualCost: {
      before: round(beforeAnnualCost, 2),
      after: round(afterAnnualCost, 2),
    },
    annualCarbon: {
      before: round(beforeAnnualCarbon, 2),
      after: round(afterAnnualCarbon, 2),
    },
    dailyGeneration: {
      before: round(currentDailyGeneration, 1),
      after: round(targetDailyGeneration, 1),
    },
  }

  const payloadResult = {
    type: 'pv_roi',
    prompt,
    assumptions,
    summary,
    beforeAfter,
    yearlyCashflow,
    report: buildReport(summary, assumptions),
  }

  const runId = createInvestmentRun({
    title: `光伏扩容投资规划 ${currentModules}→${targetModules}`,
    source: payload.source || 'manual',
    baseline_dataset_id: baseline.meta?.datasetId ?? payload.baselineDatasetId ?? null,
    plan_payload: payloadResult,
    explanation: payloadResult.report,
  })

  pushServerLog({
    level: 'ok',
    status: 'done',
    scope: 'investment',
    message: '投资建设规划已生成',
    targetDate: viewDate,
    algorithm: 'PV ROI Planner',
    detail: `${currentModules}->${targetModules} | payback ${paybackYears ?? 'N/A'}y`,
  })

  return {
    id: runId,
    title: `光伏扩容投资规划 ${currentModules}→${targetModules}`,
    source: payload.source || 'manual',
    baselineDatasetId: baseline.meta?.datasetId ?? payload.baselineDatasetId ?? null,
    payload: payloadResult,
    explanation: payloadResult.report,
    createdAt: formatBeijingDateTime(),
  }
}
