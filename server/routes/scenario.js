import { Router } from 'express'
import { getBeijingDate } from '../lib/time.js'
import { pushServerLog } from '../ws.js'
import { mergeRealtimeParams, runPython } from './optimize.js'

const router = Router()
const STRATEGIES = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']
const STRATEGY_LABELS = {
  uci: 'UCI',
  cicos: 'CICOS',
  cicar: 'CICAR',
  cicom: 'CICOM',
  pv: 'PV',
  es: 'ES',
}

function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function formatSigned(value, digits = 1) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
}

function percentDelta(next, prev) {
  if (!prev) return 0
  return ((next - prev) / prev) * 100
}

function metricLabel(metric) {
  switch (metric) {
    case 'P_G':
      return '电网购电'
    case 'P_PV':
      return '光伏出力'
    case 'P_CA':
      return '电解槽负荷'
    case 'P_PEM':
      return 'PEM 出力'
    case 'P_GM':
      return '燃机出力'
    case 'P_es_es':
      return '储能支撑'
    default:
      return metric
  }
}

function rankedSummary(summary, baseline) {
  return [...STRATEGIES]
    .map((strategy) => {
      const current = summary?.[strategy] || {}
      const base = baseline?.[strategy] || {}
      return {
        strategy,
        cost: safeNumber(current.cost),
        carbon: safeNumber(current.carbon),
        combined: safeNumber(current.combined),
        rank: 0,
        deltaCost: safeNumber(current.cost) - safeNumber(base.cost),
        deltaCarbon: safeNumber(current.carbon) - safeNumber(base.carbon),
        deltaCombined: safeNumber(current.combined) - safeNumber(base.combined),
        deltaCostPct: percentDelta(safeNumber(current.cost), safeNumber(base.cost)),
        deltaCarbonPct: percentDelta(safeNumber(current.carbon), safeNumber(base.carbon)),
        deltaCombinedPct: percentDelta(safeNumber(current.combined), safeNumber(base.combined)),
      }
    })
    .sort((a, b) => a.combined - b.combined)
    .map((item, index) => ({ ...item, rank: index + 1 }))
}

function buildKeyHours(baseDataset, scenarioDataset, strategy) {
  return Array.from({ length: 24 }, (_, index) => {
    const gridDelta = safeNumber(scenarioDataset.P_G?.[strategy]?.[index]) - safeNumber(baseDataset.P_G?.[strategy]?.[index])
    const pvDelta = safeNumber(scenarioDataset.P_PV?.[strategy]?.[index]) - safeNumber(baseDataset.P_PV?.[strategy]?.[index])
    const caDelta = safeNumber(scenarioDataset.P_CA?.[strategy]?.[index]) - safeNumber(baseDataset.P_CA?.[strategy]?.[index])
    const pemDelta = safeNumber(scenarioDataset.P_PEM?.[strategy]?.[index]) - safeNumber(baseDataset.P_PEM?.[strategy]?.[index])
    const gmDelta = safeNumber(scenarioDataset.P_GM?.[strategy]?.[index]) - safeNumber(baseDataset.P_GM?.[strategy]?.[index])
    const storageDelta = safeNumber(scenarioDataset.P_es_es?.[index]) - safeNumber(baseDataset.P_es_es?.[index])
    const changeScore = Math.abs(gridDelta) + Math.abs(pvDelta) + Math.abs(caDelta) + Math.abs(pemDelta) + Math.abs(gmDelta) + Math.abs(storageDelta)
    return {
      hour: index + 1,
      label: `${index + 1}:00-${index + 2}:00`,
      changeScore,
      gridDelta,
      pvDelta,
      caDelta,
      pemDelta,
      gmDelta,
      storageDelta,
      summary: `购电 ${formatSigned(gridDelta, 0)} kW，电解槽 ${formatSigned(caDelta, 0)} kW，PEM ${formatSigned(pemDelta, 0)} kW`,
    }
  }).sort((a, b) => b.changeScore - a.changeScore).slice(0, 4)
}

function buildDispatchHighlights(baseDataset, scenarioDataset, strategy) {
  const metrics = ['P_G', 'P_PV', 'P_CA', 'P_PEM', 'P_GM', 'P_es_es']
  return metrics.map((metric) => {
    const baseSeries = metric === 'P_es_es' ? baseDataset.P_es_es : (baseDataset[metric]?.[strategy] || [])
    const nextSeries = metric === 'P_es_es' ? scenarioDataset.P_es_es : (scenarioDataset[metric]?.[strategy] || [])
    const delta = nextSeries.reduce((sum, value, index) => sum + (safeNumber(value) - safeNumber(baseSeries?.[index])), 0) / 24
    return {
      metric,
      label: metricLabel(metric),
      strategy,
      delta,
      summary: `${metricLabel(metric)} 平均变化 ${formatSigned(delta, 1)} kW`,
    }
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 4)
}

function buildBroadcastText(insight) {
  return `${insight.headline}。${insight.summary}。${insight.recommendations?.[0] || ''}`.trim()
}

function createFollowupOptions(mode, referenceStrategy, keyHours, dispatchHighlights) {
  const topHours = keyHours.slice(0, 3).map((item) => item.hour - 1)
  const topDevice = dispatchHighlights[0]?.label || '关键补偿设备'
  if (mode === 'whatif') {
    return [
      {
        id: 'inspect_why_strategy',
        label: '为什么当前最优策略变了？',
        question: '为什么当前最优策略变了？',
        kind: 'inspect',
        payload: { action: 'inspect_why_strategy', strategy: referenceStrategy },
      },
      {
        id: 'inspect_peak_grid',
        label: '哪几个时段购电压力最大？',
        question: '哪几个时段购电压力最大？',
        kind: 'inspect',
        payload: { action: 'inspect_peak_grid', strategy: referenceStrategy },
      },
      {
        id: 'inspect_support_device',
        label: `${topDevice}承担了多少补偿？`,
        question: `${topDevice}承担了多少补偿？`,
        kind: 'inspect',
        payload: { action: 'inspect_support_device', strategy: referenceStrategy, metric: dispatchHighlights[0]?.metric },
      },
    ]
  }

  const prefix = '明天'
  return [
    {
      id: 'inspect_peak_grid',
      label: `${prefix}哪几个时段购电压力最大？`,
      question: `${prefix}哪几个时段购电压力最大？`,
      kind: 'inspect',
      payload: { action: 'inspect_peak_grid', strategy: referenceStrategy },
    },
    {
      id: 'inspect_support_device',
      label: `${prefix}${topDevice}承担了多少补偿？`,
      question: `${prefix}${topDevice}承担了多少补偿？`,
      kind: 'inspect',
      payload: { action: 'inspect_support_device', strategy: referenceStrategy, metric: dispatchHighlights[0]?.metric },
    },
    {
      id: 'optimize_peak_shaving',
      label: `如果把${prefix}购电峰值再压低10%，结果会怎样？`,
      question: `如果把${prefix}购电峰值再压低10%，结果会怎样？`,
      kind: 'optimize',
      payload: { action: 'optimize_peak_shaving', strategy: referenceStrategy, hours: topHours, reductionPct: 0.1 },
    },
  ]
}

function buildTrace(previousTrace, question, conclusion, optimized) {
  return [
    ...(Array.isArray(previousTrace) ? previousTrace : []).filter((step) => step.id !== 'followup-analysis'),
    {
      id: 'followup-analysis',
      title: optimized ? '继续分析与二次求解' : '继续分析',
      status: 'done',
      kind: 'analysis',
      detail: question,
      outcome: conclusion,
    },
  ]
}

function buildMarkdown(title, summary, bullets = [], tableRows = []) {
  const lines = [`## ${title}`, '', summary, '']
  bullets.forEach((item) => lines.push(`- ${item}`))
  if (bullets.length > 0) lines.push('')
  if (tableRows.length > 0) {
    lines.push('| 项目 | 结果 | 说明 |')
    lines.push('| --- | --- | --- |')
    tableRows.forEach((row) => lines.push(`| ${row[0]} | ${row[1]} | ${row[2]} |`))
    lines.push('')
  }
  return lines.join('\n')
}

router.post('/followup', async (req, res) => {
  try {
    const {
      question,
      baseDataset,
      scenarioDataset,
      scenarioLabel,
      scenarioInsight,
      option = null,
      previousTrace = [],
    } = req.body ?? {}

    if (!question || !baseDataset || !scenarioDataset || !scenarioInsight) {
      return res.status(400).json({ error: '缺少继续分析所需的场景上下文' })
    }

    const currentLabel = scenarioLabel || scenarioInsight.intent?.normalizedPrompt || '深入分析'
    const currentWorkspaceMode = scenarioInsight.workspaceMode || 'whatif'
    const currentSelectedStrategy = scenarioInsight.selectedStrategy || scenarioInsight.comparisonSummary?.[0]?.strategy || 'cicom'
    const action = option?.payload?.action || 'inspect_peak_grid'
    let nextDataset = scenarioDataset
    let optimized = false
    let optimizedNote = null

    pushServerLog({
      level: 'info',
      status: 'progress',
      scope: 'api',
      message: '收到继续分析请求',
      targetDate: scenarioDataset?._meta?.viewDate || baseDataset?._meta?.viewDate || getBeijingDate(),
      algorithm: action === 'optimize_peak_shaving' ? 'Scenario follow-up optimize' : 'Scenario follow-up inspect',
      detail: String(question),
    })

    if (action === 'optimize_peak_shaving') {
      optimized = true
      const reductionPct = Number(option?.payload?.reductionPct ?? 0.1)
      const hours = Array.isArray(option?.payload?.hours) && option.payload.hours.length > 0
        ? option.payload.hours.map((value) => Number(value)).filter(Number.isFinite)
        : [12, 13, 14]
      const series = scenarioDataset.P_G?.[currentSelectedStrategy] || []
      const peakValue = Math.max(...hours.map((hour) => safeNumber(series[hour])), 0)
      const constraintValue = Math.max(0, peakValue * (1 - reductionPct))
      const targetDate = scenarioDataset?._meta?.viewDate || baseDataset?._meta?.viewDate || getBeijingDate()
      const weatherMode = currentWorkspaceMode === 'day_plan' && scenarioInsight.intent?.scenarioType === 'weather_plan' ? 'cloudy' : 'forecast'
      const result = await runPython({
        mode: 'all',
        params: mergeRealtimeParams({}, { targetDate, weatherMode }),
        extra_constraints: [{
          type: 'P_grid_max',
          timesteps: hours,
          value: constraintValue,
        }],
      }, { targetDate })
      nextDataset = {
        ...result,
        _meta: {
          ...(scenarioDataset._meta || {}),
          datasetType: currentWorkspaceMode === 'day_plan' ? 'planning' : (scenarioDataset._meta?.datasetType || 'scenario'),
          viewDate: targetDate,
        },
      }
      optimizedNote = {
        hours,
        reductionPct,
        constraintValue,
      }
    }

    const comparisonSummary = rankedSummary(nextDataset.summary, baseDataset.summary)
    const baselineRanking = rankedSummary(baseDataset.summary)
    const bestBefore = baselineRanking[0]
    const bestAfter = comparisonSummary[0]
    const selectedStrategy = currentSelectedStrategy || bestAfter?.strategy || 'cicom'
    const keyHours = buildKeyHours(baseDataset, nextDataset, selectedStrategy)
    const dispatchHighlights = buildDispatchHighlights(baseDataset, nextDataset, selectedStrategy)
    const topDevice = dispatchHighlights[0]

    let headline = scenarioInsight.headline
    let summary = scenarioInsight.summary
    let driverAnalysis = scenarioInsight.driverAnalysis
    let recommendations = [...(scenarioInsight.recommendations || [])]
    let tableRows = []

    if (action === 'inspect_why_strategy') {
      headline = '最优策略变化原因分析'
      summary = bestBefore && bestAfter && bestBefore.strategy !== bestAfter.strategy
        ? `最优策略已由 ${STRATEGY_LABELS[bestBefore.strategy]} 切换为 ${STRATEGY_LABELS[bestAfter.strategy]}，主因是 ${topDevice?.label || '关键补偿设备'} 与关键时段联动重调度。`
        : `最优策略仍为 ${STRATEGY_LABELS[bestAfter.strategy]}，但其内部设备出力结构已经明显变化，说明最优性来自重调度而非策略标签切换。`
      driverAnalysis = `${scenarioInsight.bestStrategyShift?.reason || ''}${topDevice ? ` ${topDevice.summary}` : ''}`.trim()
      recommendations = [
        '继续查看购电峰值时段，可定位策略变化真正发生在哪些小时。',
        '继续查看主补偿设备，可确认是谁承担了结构性补偿。',
      ]
    } else if (action === 'inspect_peak_grid') {
      const rankedHours = (nextDataset.P_G?.[selectedStrategy] || [])
        .map((value, index) => ({ hour: index + 1, value: safeNumber(value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)
      headline = `${STRATEGY_LABELS[selectedStrategy]} 的购电峰值时段分析`
      summary = rankedHours.length > 0
        ? `${STRATEGY_LABELS[selectedStrategy]} 下购电压力最高的时段为 ${rankedHours.map((item) => `${item.hour}:00-${item.hour + 1}:00`).join('、')}。`
        : '当前场景未识别出显著购电峰值时段。'
      driverAnalysis = rankedHours.map((item) => `${item.hour}:00-${item.hour + 1}:00 购电 ${item.value.toFixed(0)} kW`).join('；')
      recommendations = [
        '优先检查这些时段的购电边界与 PEM / 燃机补偿余量。',
        '若希望进一步压峰，可继续发起购电峰值压低 10% 的二次求解。',
      ]
      tableRows = rankedHours.map((item, index) => [`TOP ${index + 1}`, `${item.hour}:00-${item.hour + 1}:00`, `${item.value.toFixed(0)} kW`])
    } else if (action === 'inspect_support_device') {
      headline = `${topDevice?.label || '关键设备'}的补偿作用分析`
      summary = topDevice
        ? `${topDevice.label} 是当前场景下承担主要补偿的设备，平均变化 ${formatSigned(topDevice.delta, 1)} kW。`
        : '当前场景下未识别出显著的主补偿设备。'
      driverAnalysis = dispatchHighlights.map((item) => item.summary).join('；')
      recommendations = [
        '继续查看关键补偿设备对应时段的负荷波动，可定位真正的调度瓶颈。',
        '如果需要验证其必要性，可以继续发起削峰后的二次求解。',
      ]
      tableRows = dispatchHighlights.map((item) => [item.label, `${formatSigned(item.delta, 1)} kW`, STRATEGY_LABELS[item.strategy]])
    } else if (action === 'optimize_peak_shaving') {
      headline = '购电削峰后的二次优化结果'
      summary = optimizedNote
        ? `已对 ${optimizedNote.hours.map((hour) => `${hour + 1}:00-${hour + 2}:00`).join('、')} 时段施加购电峰值压低 ${(optimizedNote.reductionPct * 100).toFixed(0)}% 的新约束，并完成重新求解。`
        : '已完成购电削峰后的二次求解。'
      driverAnalysis = `新的最优策略为 ${STRATEGY_LABELS[bestAfter.strategy]}，综合指标 ${formatSigned(bestAfter.deltaCombinedPct, 1)}%，成本 ${formatSigned(bestAfter.deltaCostPct, 1)}%，碳排 ${formatSigned(bestAfter.deltaCarbonPct, 1)}%。`
      recommendations = [
        '比较二次优化前后的关键时段购电曲线，确认压峰是否值得继续加严。',
        '如仍希望进一步压峰，可继续针对最高购电时段追加更细颗粒度约束。',
      ]
      tableRows = [
        ['最优策略', STRATEGY_LABELS[bestAfter.strategy], bestBefore?.strategy === bestAfter.strategy ? '策略未切换' : `由 ${STRATEGY_LABELS[bestBefore.strategy]} 切换`],
        ['综合变化', `${formatSigned(bestAfter.deltaCombinedPct, 1)}%`, '相对基准'],
        ['成本变化', `${formatSigned(bestAfter.deltaCostPct, 1)}%`, '相对基准'],
        ['碳排变化', `${formatSigned(bestAfter.deltaCarbonPct, 1)}%`, '相对基准'],
      ]
    } else {
      headline = '继续分析结果'
      summary = `已围绕“${question}”完成一层新的场景分析。`
      driverAnalysis = dispatchHighlights.map((item) => item.summary).join('；')
      recommendations = ['继续围绕关键时段、关键设备或新增约束做下一层分析。']
    }

    const analysisDepth = Number(scenarioInsight.analysisDepth || 0) + 1
    const followupOptions = createFollowupOptions(currentWorkspaceMode, selectedStrategy, keyHours, dispatchHighlights)
    const insight = {
      ...scenarioInsight,
      intent: {
        ...(scenarioInsight.intent || {}),
        scenarioType: 'deep_analysis',
      },
      headline,
      summary,
      driverAnalysis,
      recommendations,
      suggestedQuestions: followupOptions.map((item) => item.question),
      comparisonSummary,
      bestStrategyShift: {
        before: bestBefore?.strategy || bestAfter?.strategy || 'cicom',
        after: bestAfter?.strategy || bestBefore?.strategy || 'cicom',
        changed: Boolean(bestBefore && bestAfter && bestBefore.strategy !== bestAfter.strategy),
        reason: topDevice
          ? `${topDevice.label} 成为本轮分析中的主补偿设备。`
          : '综合指标排序变化有限，策略差异主要来自内部重调度。',
      },
      keyHours,
      dispatchHighlights,
      workspaceMode: currentWorkspaceMode,
      selectedStrategy,
      analysisDepth,
      analysisHistory: [
        ...(Array.isArray(scenarioInsight.analysisHistory) ? scenarioInsight.analysisHistory : []),
        {
          depth: analysisDepth,
          question,
          conclusion: summary,
          kind: option?.kind || (optimized ? 'optimize' : 'inspect'),
        },
      ],
      followupQuestion: question,
      followupAnswer: summary,
      followupOptions,
      analysisMode: 'followup',
    }
    insight.broadcastText = buildBroadcastText(insight)
    const trace = buildTrace(previousTrace, question, summary, optimized)
    const toolContent = buildMarkdown(headline, summary, [driverAnalysis, ...recommendations], tableRows)

    return res.json({
      dataset: nextDataset,
      label: currentLabel,
      insight,
      trace,
      toolContent,
    })
  } catch (error) {
    console.error('[scenario/followup]', error)
    return res.status(500).json({ error: error.message })
  }
})

export default router
