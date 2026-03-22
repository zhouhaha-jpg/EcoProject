import OpenAI from 'openai'
import config from '../config.js'
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

const openai = config.apiKey
  ? new OpenAI({
      apiKey: config.apiKey,
      baseURL: process.env.API_BASE_URL || config.apiBaseUrl,
    })
  : null

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
  const patterns = [
    /(?:从|由)?\s*(\d{3,6})\s*(?:增加|提升|扩容|扩大|扩建|增至|到)\s*(\d{3,6})/i,
    /(?:由|从)\s*(\d{3,6})\s*(?:组|块|套|个)?(?:扩容|增加|提升|扩大)(?:到|至)\s*(\d{3,6})/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return {
        currentModules: Number(match[1]),
        targetModules: Number(match[2]),
      }
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

function formatMoney(value) {
  const abs = Math.abs(value)
  if (abs >= 100000000) return `${round(value / 100000000, 2)} 亿元`
  if (abs >= 10000) return `${round(value / 10000, 1)} 万元`
  return `${round(value, 0).toLocaleString('zh-CN')} 元`
}

function formatEnergy(value) {
  if (Math.abs(value) >= 10000) return `${round(value / 10000, 2)} 万kWh`
  return `${round(value, 0)} kWh`
}

function formatCarbon(value) {
  if (Math.abs(value) >= 10000) return `${round(value / 10000, 2)} 万tCO2`
  return `${round(value, 2)} tCO2`
}

function buildDetailedFallbackReport({ prompt, assumptions, summary, beforeAfter, yearlyCashflow }) {
  const firstYearNet = summary.annualSavings + summary.annualCarbonRevenue - summary.annualOpex
  const carbonShare = firstYearNet > 0 ? (summary.annualCarbonRevenue / firstYearNet) * 100 : 0
  const payback = summary.paybackYears == null ? '超过默认寿命周期' : `${summary.paybackYears} 年`
  const finalYear = yearlyCashflow[yearlyCashflow.length - 1]
  const costDelta = beforeAfter.annualCost.after - beforeAfter.annualCost.before
  const carbonDelta = beforeAfter.annualCarbon.after - beforeAfter.annualCarbon.before
  const generationDelta = beforeAfter.dailyGeneration.after - beforeAfter.dailyGeneration.before

  return [
    '一、结论',
    `在当前测算口径下，光伏组件由 ${summary.currentModules} 组扩容到 ${summary.targetModules} 组，新增 ${summary.deltaModules} 组，预计新增投资 ${formatMoney(summary.additionalCapex)}，静态回本期约为 ${payback}。`,
    `若维持当前园区电价、碳价与日照利用条件，扩容后的首年综合净收益约为 ${formatMoney(firstYearNet)}，具备明确的投资回收能力。`,
    '',
    '二、收益结构',
    `1. 购电替代收益：首年预计节省购电成本 ${formatMoney(summary.annualSavings)}，这是本次扩容的主要收益来源。`,
    `2. 碳收益：首年预计新增碳收益 ${formatMoney(summary.annualCarbonRevenue)}，约占首年净收益的 ${round(carbonShare, 1)}%。`,
    `3. 运维成本：按 ${(assumptions.opexRate * 100).toFixed(1)}% 运维比例测算，首年新增运维成本约 ${formatMoney(summary.annualOpex)}。`,
    '',
    '三、扩容前后变化',
    `1. 年成本由 ${formatMoney(beforeAfter.annualCost.before)} 下降到 ${formatMoney(beforeAfter.annualCost.after)}，变化 ${formatMoney(costDelta)}。`,
    `2. 年碳排由 ${formatCarbon(beforeAfter.annualCarbon.before)} 下降到 ${formatCarbon(beforeAfter.annualCarbon.after)}，变化 ${formatCarbon(carbonDelta)}。`,
    `3. 日发电量由 ${formatEnergy(beforeAfter.dailyGeneration.before)} 提升到 ${formatEnergy(beforeAfter.dailyGeneration.after)}，新增 ${formatEnergy(generationDelta)}。`,
    '',
    '四、现金流判断',
    `1. 投资初始现金流为 -${formatMoney(summary.additionalCapex)}。`,
    `2. 在默认寿命 ${assumptions.lifespanYears} 年、年衰减 ${(assumptions.annualDegradation * 100).toFixed(1)}% 的假设下，第 ${summary.paybackYears ?? '--'} 年附近实现累计现金流转正。`,
    `3. 到寿命期末，累计现金流约为 ${formatMoney(finalYear?.cumulativeCashflow ?? 0)}。`,
    '',
    '五、风险与敏感性',
    '1. 对峰谷电价差敏感：若园区购电价格显著下行，回本期会被拉长。',
    `2. 对组件单价敏感：当前采用 ${assumptions.capexPerModule} 元/组的 CAPEX 假设，若采购成本上升，投资回收速度将变慢。`,
    `3. 对日照利用率敏感：本次测算基于当前数据集的实际发电曲线推导，若后续气象条件偏弱，年收益会下降。`,
    '',
    '六、建议',
    `1. 若目标是尽快回收投资，本方案可优先实施，并重点锁定组件采购价格与并网利用率。`,
    '2. 若比赛展示需要更强的可视化冲击，建议同时展示累计现金流曲线与扩容前后对比卡，突出“投资额、首年收益、回本期”三项核心指标。',
    prompt ? `3. 原始提问：${prompt}` : '3. 建议后续叠加更多假设场景，例如碳价提升、电价上涨、运维成本变化。',
  ].join('\n')
}

async function generateDetailedInvestmentReport(payload) {
  const fallback = buildDetailedFallbackReport(payload)
  if (!openai) return fallback

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || config.model,
      temperature: 0.35,
      max_tokens: 1100,
      messages: [
        {
          role: 'system',
          content:
            '你是园区新能源投资分析顾问。请基于给定结构化测算结果，输出中文投资报告。要求内容详实、专业、易懂，包含六个小节：一、结论；二、收益结构；三、扩容前后变化；四、现金流判断；五、风险与敏感性；六、建议。只能使用提供的数据，不要编造不存在的指标。',
        },
        {
          role: 'user',
          content: JSON.stringify(payload, null, 2),
        },
      ],
    })

    const report = completion.choices?.[0]?.message?.content?.trim()
    if (!report) return fallback

    pushServerLog({
      level: 'ok',
      status: 'progress',
      scope: 'investment',
      message: '投资报告已由 LLM 扩展生成',
      targetDate: payload.summary.viewDate,
      algorithm: 'PV ROI Planner + LLM Report',
      detail: `${payload.summary.currentModules}->${payload.summary.targetModules}`,
    })

    return report
  } catch (error) {
    pushServerLog({
      level: 'warn',
      status: 'progress',
      scope: 'investment',
      message: 'LLM 投资报告生成失败，已回退到结构化报告',
      targetDate: payload.summary.viewDate,
      algorithm: 'PV ROI Planner',
      detail: error instanceof Error ? error.message : String(error),
    })
    return fallback
  }
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

  const reportPayload = {
    prompt,
    assumptions,
    summary,
    beforeAfter,
    yearlyCashflow,
  }

  const report = await generateDetailedInvestmentReport(reportPayload)

  const payloadResult = {
    type: 'pv_roi',
    prompt,
    assumptions,
    summary,
    beforeAfter,
    yearlyCashflow,
    report,
  }

  const title = `光伏扩容投资规划 ${currentModules}→${targetModules}`
  const runId = createInvestmentRun({
    title,
    source: payload.source || 'manual',
    baseline_dataset_id: baseline.meta?.datasetId ?? payload.baselineDatasetId ?? null,
    plan_payload: payloadResult,
    explanation: report,
  })

  pushServerLog({
    level: 'ok',
    status: 'done',
    scope: 'investment',
    message: '投资建设规划已生成',
    targetDate: viewDate,
    algorithm: openai ? 'PV ROI Planner + LLM Report' : 'PV ROI Planner',
    detail: `${currentModules}->${targetModules} | payback ${paybackYears ?? 'N/A'}y`,
  })

  return {
    id: runId,
    title,
    source: payload.source || 'manual',
    baselineDatasetId: baseline.meta?.datasetId ?? payload.baselineDatasetId ?? null,
    payload: payloadResult,
    explanation: report,
    createdAt: formatBeijingDateTime(),
  }
}
