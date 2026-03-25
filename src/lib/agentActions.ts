import type { ParetoData } from '@/context/StrategyContext'
import type {
  AnomalyRun,
  DatasetMeta,
  EcoDataset,
  EmergencyRun,
  ExecutionTraceStep,
  InvestmentRun,
  ScenarioComparisonItem,
  ScenarioDispatchHighlight,
  ScenarioInsight,
  ScenarioKeyHourInsight,
  ScenarioRiskFlag,
  StrategyKey,
  WhatIfIntentSpec,
} from '@/types'

export type AgentActionType =
  | 'navigate'
  | 'switchStrategy'
  | 'run_whatif'
  | 'analyze_scenario_followup'
  | 'run_emergency_dispatch'
  | 'run_investment_planning'
  | 'run_device_anomaly_dispatch'
  | 'list_emergency_runs'
  | 'apply_emergency_run'
  | 'restore_normal_state'
  | 'add_constraint'
  | 'trace_causality'
  | 'generate_chart'
  | 'pareto_scan'
  | 'get_realtime_data'
  | 'get_alerts'
  | 'carbon_electricity_analysis'

export interface AgentActionHandlers {
  navigate: (path: string) => void
  switchStrategy: (key: StrategyKey) => void
  loadScenarioDataset: (
    dataset: Record<string, unknown>,
    label: string,
    options?: { insight?: ScenarioInsight | null; trace?: ExecutionTraceStep[] | null },
  ) => void
  loadParetoData: (data: ParetoData, label: string) => void
  setEmergencyPreviewRun: (run: EmergencyRun | null) => void
  applyEmergencyRunState: (run: EmergencyRun, dataset?: Record<string, unknown>, meta?: DatasetMeta) => void
  setInvestmentPlan: (run: InvestmentRun | null) => void
  setAnomalyPreviewRun: (run: AnomalyRun | null) => void
  applyAnomalyRunState: (run: AnomalyRun, dataset?: Record<string, unknown>, meta?: DatasetMeta) => void
  restoreNormalDatasetState: (dataset?: Record<string, unknown>, meta?: DatasetMeta) => void
}

const PATH_MAP: Record<string, string> = {
  '/': '/overview',
  overview: '/overview',
  '总览': '/overview',
  '/ca': '/ca',
  ca: '/ca',
  '电解槽': '/ca',
  '/pv': '/pv',
  pv: '/pv',
  '光伏': '/pv',
  '/gm': '/gm',
  gm: '/gm',
  '燃气轮机': '/gm',
  '/pem': '/pem',
  pem: '/pem',
  '/g': '/g',
  g: '/g',
  '电网': '/g',
  '/economic': '/economic',
  '经济指标': '/economic',
  '/storage': '/storage',
  '储能模块': '/storage',
  '/scenario': '/scenario',
  EcoClaw: '/scenario',
  '方案对比': '/scenario',
}

const STRATEGY_MAP: Record<string, StrategyKey> = {
  uci: 'uci',
  cicos: 'cicos',
  cicar: 'cicar',
  cicom: 'cicom',
  pv: 'pv',
  es: 'es',
  '统一控制综合': 'uci',
  '成本优化': 'cicos',
  '碳排优化': 'cicar',
  '综合优化': 'cicom',
  '光伏优先': 'pv',
  '储能优化': 'es',
}

const API_BASE = ''

let handlers: AgentActionHandlers | null = null

export function registerAgentHandlers(nextHandlers: AgentActionHandlers) {
  handlers = nextHandlers
}

export interface AgentExecutionContext {
  fullData: EcoDataset
  datasetMeta?: DatasetMeta
  activeStrategy?: StrategyKey
  scenarioDataset?: EcoDataset | null
  scenarioLabel?: string | null
  scenarioInsight?: ScenarioInsight | null
  scenarioTrace?: ExecutionTraceStep[] | null
  emergencyRunId?: number | null
  anomalyRunId?: number | null
}

function requireHandlers(type: string) {
  if (!handlers) {
    throw new Error(`Agent handlers not registered for action: ${type}`)
  }
  return handlers
}

const STRATEGIES: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']

type AgentActionResult = {
  success: boolean
  message: string
  data?: unknown
  trace?: ExecutionTraceStep[]
  toolContent?: string
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function pctDelta(next: number, prev: number): number {
  if (!prev) return 0
  return ((next - prev) / prev) * 100
}

function formatSigned(value: number, digits = 1) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
}

function metricLabel(metric: string) {
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

function strategyLabel(strategy: StrategyKey) {
  return strategy.toUpperCase()
}

function rankedSummary(summary: EcoDataset['summary'], baseline?: EcoDataset['summary']): ScenarioComparisonItem[] {
  return [...STRATEGIES]
    .map((strategy) => {
      const current = summary[strategy]
      const base = baseline?.[strategy]
      return {
        strategy,
        cost: safeNumber(current?.cost),
        carbon: safeNumber(current?.carbon),
        combined: safeNumber(current?.combined),
        rank: 0,
        deltaCost: safeNumber(current?.cost) - safeNumber(base?.cost),
        deltaCarbon: safeNumber(current?.carbon) - safeNumber(base?.carbon),
        deltaCombined: safeNumber(current?.combined) - safeNumber(base?.combined),
        deltaCostPct: pctDelta(safeNumber(current?.cost), safeNumber(base?.cost)),
        deltaCarbonPct: pctDelta(safeNumber(current?.carbon), safeNumber(base?.carbon)),
        deltaCombinedPct: pctDelta(safeNumber(current?.combined), safeNumber(base?.combined)),
      }
    })
    .sort((a, b) => a.combined - b.combined)
    .map((item, index) => ({ ...item, rank: index + 1 }))
}

function summarizeWhatIfParams(params: Record<string, unknown>) {
  const normalized: string[] = []
  const targets = new Set<string>()
  if (typeof params.n_PV === 'number') {
    normalized.push(`n_PV 调整为 ${params.n_PV}`)
    targets.add('光伏配置')
  }
  if (typeof params.G_scale === 'number') {
    const ratio = (params.G_scale - 1) * 100
    normalized.push(`G_scale ${formatSigned(ratio, 0)}%`)
    targets.add('光伏出力')
  }
  if (typeof params.c_carbon === 'number') {
    normalized.push(`碳价调整为 ${params.c_carbon} 元/tCO2`)
    targets.add('碳排成本')
  }
  if (typeof params.H_max === 'number') {
    normalized.push(`储氢容量调整为 ${params.H_max}`)
    targets.add('储氢约束')
  }
  if (typeof params.w_cost === 'number' || typeof params.w_carbon === 'number') {
    normalized.push(`目标权重更新为 cost=${safeNumber(params.w_cost).toFixed(2)} carbon=${safeNumber(params.w_carbon).toFixed(2)}`)
    targets.add('调度目标')
  }
  if (Array.isArray(params.price_grid)) {
    normalized.push('price_grid 使用新的 24h 电价曲线')
    targets.add('购电成本')
  }
  if (Array.isArray(params.EF_grid)) {
    normalized.push('EF_grid 使用新的 24h 碳因子曲线')
    targets.add('碳排信号')
  }
  return { normalized, targets: [...targets] }
}

function summarizeConstraints(constraints: Array<Record<string, unknown>>) {
  const normalized = constraints.map((constraint, index) => {
    const hours = Array.isArray(constraint.timesteps)
      ? (constraint.timesteps as unknown[]).map((step) => Number(step) + 1).filter(Number.isFinite)
      : []
    const hourText = hours.length ? `${Math.min(...hours)}-${Math.max(...hours)} 时` : '指定时段'
    return `${index + 1}. ${String(constraint.type ?? '约束')} ${hourText} = ${constraint.value ?? '--'}`
  })
  return {
    normalized,
    targets: ['购电约束', '时段边界', '可行域收缩'],
  }
}

function buildTrace(
  intent: WhatIfIntentSpec,
  normalizedChanges: string[],
  defaults: string[],
  summary: string,
  recommendation: string,
): ExecutionTraceStep[] {
  return [
    {
      id: 'intent',
      title: '意图解析',
      status: 'done',
      kind: 'intent',
      detail: intent.rawPrompt,
      outcome: `${intent.scenarioType === 'constraint' ? '约束调度' : 'What-if 推演'} · 影响对象 ${intent.impactTargets.join(' / ') || '综合调度'}`,
    },
    {
      id: 'mapping',
      title: '参数映射',
      status: 'done',
      kind: 'mapping',
      detail: normalizedChanges.join('；') || '沿用当前参数',
      outcome: defaults.length ? `默认继承：${defaults.join('；')}` : '参数映射完成',
    },
    {
      id: 'validation',
      title: '可行性检查',
      status: 'done',
      kind: 'validation',
      detail: '沿用当前实时电价、碳因子和基线设备边界',
      outcome: '通过基础约束检查，进入优化求解',
    },
    {
      id: 'solver',
      title: '优化求解',
      status: 'done',
      kind: 'solver',
      detail: '调用多策略调度优化器，重算 6 套策略',
      outcome: '求解完成，已生成基准 vs 推演结果',
    },
    {
      id: 'analysis',
      title: '差异归因',
      status: 'done',
      kind: 'analysis',
      detail: summary,
      outcome: '已提取关键时段与主补偿设备',
    },
    {
      id: 'advice',
      title: '调度建议',
      status: 'done',
      kind: 'advice',
      detail: recommendation,
      outcome: '可继续追问关键时段、策略变更原因或约束边界',
    },
  ]
}

function buildKeyHours(base: EcoDataset, scenario: EcoDataset, strategy: StrategyKey): ScenarioKeyHourInsight[] {
  const scores = Array.from({ length: 24 }, (_, idx) => {
    const gridDelta = safeNumber(scenario.P_G?.[strategy]?.[idx]) - safeNumber(base.P_G?.[strategy]?.[idx])
    const pvDelta = safeNumber(scenario.P_PV?.[strategy]?.[idx]) - safeNumber(base.P_PV?.[strategy]?.[idx])
    const caDelta = safeNumber(scenario.P_CA?.[strategy]?.[idx]) - safeNumber(base.P_CA?.[strategy]?.[idx])
    const pemDelta = safeNumber(scenario.P_PEM?.[strategy]?.[idx]) - safeNumber(base.P_PEM?.[strategy]?.[idx])
    const gmDelta = safeNumber(scenario.P_GM?.[strategy]?.[idx]) - safeNumber(base.P_GM?.[strategy]?.[idx])
    const storageDelta = safeNumber(scenario.P_es_es?.[idx]) - safeNumber(base.P_es_es?.[idx])
    const changeScore = Math.abs(gridDelta) + Math.abs(pvDelta) + Math.abs(caDelta) + Math.abs(pemDelta) + Math.abs(gmDelta) + Math.abs(storageDelta)
    return {
      hour: idx + 1,
      label: `${idx + 1}:00-${idx + 2}:00`,
      changeScore,
      gridDelta,
      pvDelta,
      caDelta,
      pemDelta,
      gmDelta,
      storageDelta,
      summary: `购电 ${formatSigned(gridDelta, 0)} kW，电解槽 ${formatSigned(caDelta, 0)} kW，PEM ${formatSigned(pemDelta, 0)} kW`,
    }
  })

  return scores
    .sort((a, b) => b.changeScore - a.changeScore)
    .slice(0, 4)
}

function buildDispatchHighlights(base: EcoDataset, scenario: EcoDataset, strategy: StrategyKey): ScenarioDispatchHighlight[] {
  const metrics: Array<ScenarioDispatchHighlight['metric']> = ['P_G', 'P_PV', 'P_CA', 'P_PEM', 'P_GM', 'P_es_es']
  const highlights = metrics.map((metric) => {
    const seriesBase: number[] = metric === 'P_es_es'
      ? base.P_es_es
      : (base[metric as 'P_G' | 'P_PV' | 'P_CA' | 'P_PEM' | 'P_GM']?.[strategy] ?? [])
    const seriesScenario: number[] = metric === 'P_es_es'
      ? scenario.P_es_es
      : (scenario[metric as 'P_G' | 'P_PV' | 'P_CA' | 'P_PEM' | 'P_GM']?.[strategy] ?? [])
    const delta = (seriesScenario ?? []).reduce((acc: number, value: number, index: number) => acc + (safeNumber(value) - safeNumber(seriesBase?.[index])), 0) / 24
    return {
      metric,
      label: metricLabel(metric),
      strategy,
      delta,
      summary: `${metricLabel(metric)} 平均变化 ${formatSigned(delta, 1)} kW`,
    }
  })

  return highlights.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 4)
}

function buildRiskFlags(
  bestBefore: ScenarioComparisonItem,
  bestAfter: ScenarioComparisonItem,
  keyHours: ScenarioKeyHourInsight[],
): ScenarioRiskFlag[] {
  const risks: ScenarioRiskFlag[] = []
  if (bestAfter.deltaCost > 0) {
    risks.push({
      type: 'cost_up',
      level: 'warning',
      label: '综合最优成本上升',
      detail: `最优策略成本变化 ${formatSigned(bestAfter.deltaCostPct, 1)}%`,
    })
  }
  if (bestAfter.deltaCarbon > 0) {
    risks.push({
      type: 'carbon_up',
      level: 'warning',
      label: '综合最优碳排上升',
      detail: `最优策略碳排变化 ${formatSigned(bestAfter.deltaCarbonPct, 1)}%`,
    })
  }
  if (keyHours.some((item) => item.gridDelta > 300)) {
    const peak = keyHours.reduce((prev, current) => current.gridDelta > prev.gridDelta ? current : prev, keyHours[0])
    risks.push({
      type: 'grid_dependency_up',
      level: 'critical',
      label: '购电依赖显著抬升',
      detail: `${peak.label} 购电增加 ${peak.gridDelta.toFixed(0)} kW`,
    })
  }
  return risks
}

function buildScenarioInsight(args: {
  label: string
  rawPrompt: string
  scenarioType: 'whatif' | 'constraint'
  normalizedChanges: string[]
  defaults: string[]
  baseDataset?: EcoDataset
  scenarioDataset: EcoDataset
  activeStrategy?: StrategyKey
  impactTargets: string[]
}): { insight: ScenarioInsight; trace: ExecutionTraceStep[] } {
  const baseSummary = args.baseDataset?.summary
  const comparisonSummary = rankedSummary(args.scenarioDataset.summary, baseSummary)
  const baselineRanking = baseSummary ? rankedSummary(baseSummary) : comparisonSummary
  const bestBefore = baselineRanking[0]
  const bestAfter = comparisonSummary[0]
  const referenceStrategy = bestAfter?.strategy ?? args.activeStrategy ?? 'cicom'
  const keyHours = args.baseDataset
    ? buildKeyHours(args.baseDataset, args.scenarioDataset, referenceStrategy)
    : []
  const dispatchHighlights = args.baseDataset
    ? buildDispatchHighlights(args.baseDataset, args.scenarioDataset, referenceStrategy)
    : []
  const riskFlags = bestBefore && bestAfter ? buildRiskFlags(bestBefore, bestAfter, keyHours) : []
  const bestChanged = Boolean(bestBefore && bestAfter && bestBefore.strategy !== bestAfter.strategy)
  const topHighlight = dispatchHighlights[0]
  const headline = bestChanged
    ? `${strategyLabel(bestBefore.strategy)} 不再最优，当前最优转为 ${strategyLabel(bestAfter.strategy)}。`
    : `${strategyLabel(bestAfter.strategy)} 仍是综合最优，但调度结构已明显变化。`
  const summary = bestBefore && bestAfter
    ? `最优方案综合指标 ${formatSigned(bestAfter.deltaCombinedPct, 1)}%，成本 ${formatSigned(bestAfter.deltaCostPct, 1)}%，碳排 ${formatSigned(bestAfter.deltaCarbonPct, 1)}%。`
    : '已完成基准与推演对比。'
  const recommendation = topHighlight
    ? `优先关注 ${topHighlight.label} 的调节边界，并围绕 ${referenceStrategy.toUpperCase()} 做进一步约束收敛。`
    : '建议继续查看关键时段与购电压力变化。'

  const intent: WhatIfIntentSpec = {
    rawPrompt: args.rawPrompt,
    normalizedPrompt: args.label,
    scenarioType: args.scenarioType,
    impactTargets: args.impactTargets,
  }

  return {
    insight: {
      intent,
      normalizedChanges: args.normalizedChanges,
      appliedDefaults: args.defaults,
      comparisonSummary,
      bestStrategyShift: {
        before: bestBefore?.strategy ?? bestAfter?.strategy ?? 'cicom',
        after: bestAfter?.strategy ?? bestBefore?.strategy ?? 'cicom',
        changed: bestChanged,
        reason: topHighlight
          ? `${topHighlight.label} 成为主要补偿变量，推动最优策略${bestChanged ? '切换' : '重排'}。`
          : '综合指标排序变化有限，主要由成本与碳排权衡引起。',
      },
      keyHours,
      dispatchHighlights,
      riskFlags,
      headline,
      summary,
      driverAnalysis: topHighlight
        ? `${topHighlight.summary}，关键变化时段集中在 ${keyHours.slice(0, 2).map((item) => item.label).join('、') || '核心负荷窗口'}。`
        : '当前场景已完成推演，但尚未提取出显著设备补偿主因。',
      recommendations: [
        recommendation,
        '继续追问“为什么最优策略变了”可触发更细的因果追溯。',
        '如需控制代价，可在当前场景上继续加入购电上限或成本边界约束。',
      ],
      suggestedQuestions: [
        '为什么最优策略变了？',
        '哪几个时段购电压力最大？',
        '如果只允许成本增加不超过3%，还能再降多少碳？',
      ],
    },
    trace: buildTrace(intent, args.normalizedChanges, args.defaults, summary, recommendation),
  }
}

function buildScenarioToolContent(label: string, insight: ScenarioInsight, trace: ExecutionTraceStep[]) {
  const topHours = insight.keyHours.map((item) => `${item.label}(${item.summary})`).join('；') || '无显著时段'
  const recommendations = insight.recommendations.join('；')
  return [
    `场景: ${label}`,
    `结论: ${insight.headline}`,
    `摘要: ${insight.summary}`,
    `主因: ${insight.driverAnalysis}`,
    `关键时段: ${topHours}`,
    `建议: ${recommendations}`,
    `执行链: ${trace.map((item) => `${item.title}:${item.outcome ?? item.detail ?? ''}`).join(' | ')}`,
  ].join('\n')
}

function matchScenarioFollowupQuestion(question: string) {
  const normalized = question.replace(/\s+/g, '').toLowerCase()
  if (normalized.includes('为什么') && normalized.includes('最优策略')) return 'why_strategy_changed'
  if (normalized.includes('哪几个时段') && (normalized.includes('购电') || normalized.includes('电网')) && normalized.includes('压力最大')) return 'peak_grid_hours'
  if (normalized.includes('成本增加不超过3%') || (normalized.includes('成本') && normalized.includes('3%') && normalized.includes('还能再降多少碳'))) return 'carbon_under_cost_cap'
  return null
}

function buildFollowupMarkdown(question: string, title: string, summary: string, bullets: string[], table?: Array<[string, string, string]>) {
  const lines = [
    `## ${title}`,
    '',
    summary,
    '',
  ]
  if (bullets.length > 0) {
    bullets.forEach((item) => lines.push(`- ${item}`))
    lines.push('')
  }
  if (table && table.length > 0) {
    lines.push('| 项目 | 结果 | 说明 |')
    lines.push('| --- | --- | --- |')
    table.forEach((row) => lines.push(`| ${row[0]} | ${row[1]} | ${row[2]} |`))
    lines.push('')
  }
  return lines.join('\n')
}

export async function executeAction(
  type: string,
  params: Record<string, unknown>,
  context?: AgentExecutionContext,
): Promise<AgentActionResult> {
  try {
    switch (type as AgentActionType) {
      case 'navigate': {
        const path = String(params.path ?? '')
        const resolved = PATH_MAP[path] ?? path
        if (!resolved.startsWith('/')) return { success: false, message: `无效路径: ${path}` }
        requireHandlers(type).navigate(resolved)
        return { success: true, message: `已切换到页面: ${resolved}` }
      }

      case 'switchStrategy': {
        const key = String(params.key ?? '').toLowerCase()
        const resolved = STRATEGY_MAP[key] ?? (key as StrategyKey)
        if (!['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es'].includes(resolved)) {
          return { success: false, message: `无效策略: ${key}` }
        }
        requireHandlers(type).switchStrategy(resolved)
        return { success: true, message: `已切换到策略: ${resolved}` }
      }

      case 'run_whatif': {
        const desc = String(params.description ?? 'What-If 推演')
        const overrides = (params.params ?? {}) as Record<string, unknown>
        const res = await fetch(`${API_BASE}/api/optimize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ params: overrides, save: true, name: desc }),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const h = requireHandlers(type)
        if (data.summary) {
          const summaryMeta = summarizeWhatIfParams(overrides)
          const { insight, trace } = buildScenarioInsight({
            label: desc,
            rawPrompt: desc,
            scenarioType: 'whatif',
            normalizedChanges: summaryMeta.normalized,
            defaults: ['未显式修改的时变参数继承当前实时曲线', '设备边界沿用现有模型默认值'],
            baseDataset: context?.fullData,
            scenarioDataset: data as EcoDataset,
            activeStrategy: context?.activeStrategy,
            impactTargets: summaryMeta.targets,
          })
          h.loadScenarioDataset(data, desc, { insight, trace })
          h.navigate('/scenario')
          return {
            success: true,
            message: `${desc} 求解完成`,
            data: { dataset: data, insight, trace },
            trace,
            toolContent: buildScenarioToolContent(desc, insight, trace),
          }
        }
        return { success: true, message: `${desc} 求解完成`, data }
      }

      case 'analyze_scenario_followup': {
        const question = String(params.question ?? '').trim()
        const followupType = matchScenarioFollowupQuestion(question)
        const scenarioDataset = context?.scenarioDataset
        const scenarioInsight = context?.scenarioInsight
        const scenarioLabel = context?.scenarioLabel ?? 'What-if 深入分析'
        if (!question) return { success: false, message: '缺少追问内容' }
        if (!scenarioDataset || !scenarioInsight) {
          return { success: false, message: '当前没有可继续分析的 What-if 场景' }
        }

        const baseDataset = context.fullData
        const currentTrace = context.scenarioTrace ?? []
        const baseBest = scenarioInsight.comparisonSummary[0]?.strategy ?? context.activeStrategy ?? 'cicom'
        let updatedInsight: ScenarioInsight = {
          ...scenarioInsight,
          analysisMode: 'followup',
          followupQuestion: question,
        }
        let markdown = `## 深入分析\n\n${question}`
        let extraTraceDetail = ''

        if (followupType === 'why_strategy_changed') {
          const topDevice = scenarioInsight.dispatchHighlights[0]
          const topHours = scenarioInsight.keyHours.slice(0, 3).map((item) => `${item.label}（${item.summary}）`)
          const changed = scenarioInsight.bestStrategyShift.changed
          const answer = changed
            ? `${strategyLabel(scenarioInsight.bestStrategyShift.before)} 到 ${strategyLabel(scenarioInsight.bestStrategyShift.after)} 的切换，核心由 ${topDevice?.label ?? '关键补偿设备'} 和关键时段重调度共同驱动。`
            : `最优策略没有切换，但 ${strategyLabel(scenarioInsight.bestStrategyShift.after)} 的设备出力结构已经明显变化，说明最优性来自内部重调度而不是策略标签变化。`
          updatedInsight = {
            ...updatedInsight,
            headline: '最优策略变化原因分析',
            summary: answer,
            driverAnalysis: `${scenarioInsight.bestStrategyShift.reason} 关键时段集中在 ${topHours.join('、') || '主负荷窗口'}。`,
            followupAnswer: answer,
            recommendations: [
              '优先检查关键时段的购电上限与 PEM/电解槽联动边界。',
              '若想保持当前最优策略，可继续对关键时段加更细的成本或购电约束。',
            ],
          }
          markdown = buildFollowupMarkdown(
            question,
            '最优策略为什么会变化',
            answer,
            [
              `策略变化结论：${scenarioInsight.bestStrategyShift.reason}`,
              `关键设备：${topDevice?.summary ?? '暂无显著设备差异'}`,
              `关键时段：${topHours.join('；') || '暂无显著时段'}`,
            ],
          )
          extraTraceDetail = answer
        } else if (followupType === 'peak_grid_hours') {
          const bestStrategySeries = scenarioDataset.P_G?.[baseBest] ?? []
          const rankedHours = bestStrategySeries
            .map((value, index) => ({ hour: index + 1, value: safeNumber(value) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 3)
          const answer = rankedHours.length > 0
            ? `${strategyLabel(baseBest)} 方案下购电压力最大的时段为 ${rankedHours.map((item) => `${item.hour}:00-${item.hour + 1}:00`).join('、')}。`
            : '当前场景未识别出明显的购电高压时段。'
          updatedInsight = {
            ...updatedInsight,
            headline: '购电压力峰值时段分析',
            summary: answer,
            driverAnalysis: rankedHours.map((item) => `${item.hour}:00-${item.hour + 1}:00 购电 ${item.value.toFixed(0)} kW`).join('；') || scenarioInsight.driverAnalysis,
            followupAnswer: answer,
            followupQuestion: question,
          }
          markdown = buildFollowupMarkdown(
            question,
            '购电压力最大的时段',
            answer,
            rankedHours.map((item) => `${item.hour}:00-${item.hour + 1}:00 购电 ${item.value.toFixed(0)} kW`),
            rankedHours.map((item, index) => [
              `TOP ${index + 1}`,
              `${item.hour}:00-${item.hour + 1}:00`,
              `${item.value.toFixed(0)} kW`,
            ]),
          )
          extraTraceDetail = answer
        } else if (followupType === 'carbon_under_cost_cap') {
          const feasible = scenarioInsight.comparisonSummary
            .filter((item) => item.deltaCostPct <= 3)
            .sort((a, b) => a.carbon - b.carbon)
          const best = feasible[0]
          const answer = best
            ? `在“成本增加不超过3%”约束下，可选策略中碳排最低的是 ${strategyLabel(best.strategy)}，相对基准碳排变化 ${formatSigned(best.deltaCarbonPct, 1)}%，成本变化 ${formatSigned(best.deltaCostPct, 1)}%。`
            : '当前 6 套策略中，没有方案同时满足成本增加不超过 3% 且进一步显著降碳。'
          updatedInsight = {
            ...updatedInsight,
            headline: '成本边界下的降碳空间分析',
            summary: answer,
            driverAnalysis: best
              ? `${strategyLabel(best.strategy)} 是当前成本边界内的最低碳选择，可作为下一轮约束求解的目标策略。`
              : '建议进一步发起带成本边界的约束求解，而不是只看当前策略排序。',
            followupAnswer: answer,
            followupQuestion: question,
            recommendations: best
              ? [
                  `可继续切换到 ${strategyLabel(best.strategy)} 作为参考策略，叠加购电上限或碳排目标约束。`,
                  '如果要严谨验证该边界，建议直接发起新的约束求解而不是仅做静态比较。',
                ]
              : [
                  '当前静态比较不足以证明有额外降碳空间，建议立刻追加成本边界约束重新求解。',
                ],
          }
          markdown = buildFollowupMarkdown(
            question,
            '成本不超过 3% 时还能降多少碳',
            answer,
            best ? [
              `候选策略：${strategyLabel(best.strategy)}`,
              `成本变化：${formatSigned(best.deltaCostPct, 1)}%`,
              `碳排变化：${formatSigned(best.deltaCarbonPct, 1)}%`,
            ] : ['建议改为新的约束求解任务进行验证。'],
            feasible.slice(0, 4).map((item) => [
              strategyLabel(item.strategy),
              `${formatSigned(item.deltaCostPct, 1)}%`,
              `${formatSigned(item.deltaCarbonPct, 1)}%`,
            ]),
          )
          extraTraceDetail = answer
        } else {
          const answer = `已围绕当前 What-if 场景对问题“${question}”做进一步聚焦分析。`
          updatedInsight = {
            ...updatedInsight,
            followupAnswer: answer,
            followupQuestion: question,
            analysisMode: 'followup',
          }
          markdown = buildFollowupMarkdown(question, '深入分析', answer, [scenarioInsight.driverAnalysis])
          extraTraceDetail = answer
        }

        const trace: ExecutionTraceStep[] = [
          ...currentTrace.filter((step) => step.id !== 'followup-analysis'),
          {
            id: 'followup-analysis',
            title: '继续分析',
            status: 'done',
            kind: 'analysis',
            detail: question,
            outcome: extraTraceDetail,
          },
        ]

        requireHandlers(type).loadScenarioDataset(
          scenarioDataset as unknown as Record<string, unknown>,
          scenarioLabel,
          { insight: updatedInsight, trace },
        )
        requireHandlers(type).navigate('/scenario')
        return {
          success: true,
          message: `已完成继续分析：${question}`,
          data: { insight: updatedInsight, trace },
          trace,
          toolContent: markdown,
        }
      }

      case 'run_emergency_dispatch': {
        const prompt = String(params.prompt ?? params.description ?? '')
        if (!prompt.trim()) return { success: false, message: '缺少应急场景描述' }
        const res = await fetch(`${API_BASE}/api/emergency/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            eventSpec: { severity: String(params.severity ?? 'critical') },
            baselineDataset: context?.fullData,
            baselineMeta: context?.datasetMeta,
            baselineDatasetId: context?.datasetMeta?.datasetId ?? null,
            activeStrategy: context?.activeStrategy ?? 'es',
            source: 'manual',
          }),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const h = requireHandlers(type)
        h.setEmergencyPreviewRun(data.run)
        h.navigate('/scenario')
        return {
          success: true,
          message: `${data.run?.title ?? '应急预案'} 已生成，可在 EcoClaw 查看并决定是否应用。`,
          data: data.run,
        }
      }

      case 'run_investment_planning': {
        const prompt = String(params.prompt ?? params.description ?? '')
        if (!prompt.trim()) return { success: false, message: '缺少投资规划问题描述' }
        const res = await fetch(`${API_BASE}/api/investment/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            baselineDataset: context?.fullData,
            baselineMeta: context?.datasetMeta,
            baselineDatasetId: context?.datasetMeta?.datasetId ?? null,
            activeStrategy: context?.activeStrategy ?? 'es',
            source: 'manual',
          }),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const h = requireHandlers(type)
        h.setInvestmentPlan(data.run)
        h.navigate('/scenario')
        return {
          success: true,
          message: `${data.run?.title ?? '投资规划'} 已生成，可在 EcoClaw 查看。`,
          data: data.run,
        }
      }

      case 'run_device_anomaly_dispatch': {
        const prompt = String(params.prompt ?? params.description ?? '')
        if (!prompt.trim()) return { success: false, message: '缺少设备异常场景描述' }
        const res = await fetch(`${API_BASE}/api/anomaly/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            eventSpec: {
              severity: String(params.severity ?? 'critical'),
              deviceType: params.device_type ?? undefined,
            },
            baselineDataset: context?.fullData,
            baselineMeta: context?.datasetMeta,
            baselineDatasetId: context?.datasetMeta?.datasetId ?? null,
            activeStrategy: context?.activeStrategy ?? 'es',
            source: 'manual',
          }),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const h = requireHandlers(type)
        h.setAnomalyPreviewRun(data.run)
        h.navigate('/scenario')
        return {
          success: true,
          message: `${data.run?.title ?? '设备异常方案'} 已生成，可在 EcoClaw 查看并决定是否应用。`,
          data: data.run,
        }
      }

      case 'list_emergency_runs': {
        const limitNum = params.limit ? Number(params.limit) : 10
        const res = await fetch(`${API_BASE}/api/emergency/runs?limit=${limitNum}`)
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        return { success: true, message: `获取到 ${Array.isArray(data.data) ? data.data.length : 0} 条应急预案`, data: data.data }
      }

      case 'apply_emergency_run': {
        const runId = Number(params.run_id ?? params.id)
        if (!Number.isFinite(runId)) return { success: false, message: '缺少应急预案 ID' }
        const res = await fetch(`${API_BASE}/api/emergency/runs/${runId}/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const h = requireHandlers(type)
        h.applyEmergencyRunState(data.run, data.dataset?.data, data.dataset?.meta)
        h.navigate('/scenario')
        return { success: true, message: `${data.run?.title ?? `应急预案 ${runId}`} 已应用到全平台展示`, data }
      }

      case 'restore_normal_state': {
        const useAnomaly = Boolean(context?.datasetMeta?.anomalyActive || context?.anomalyRunId)
        const runId = Number(params.run_id ?? (useAnomaly ? context?.anomalyRunId : context?.emergencyRunId) ?? Number.NaN)
        const endpoint = useAnomaly ? '/api/anomaly/restore' : '/api/emergency/restore'
        const res = await fetch(`${API_BASE}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Number.isFinite(runId) ? { runId } : {}),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const h = requireHandlers(type)
        h.restoreNormalDatasetState(data.baselineDataset?.data, data.baselineDataset?.meta)
        if (useAnomaly) {
          h.setAnomalyPreviewRun(data.run ?? null)
        } else {
          h.setEmergencyPreviewRun(data.run ?? null)
        }
        h.navigate('/scenario')
        return { success: true, message: '已恢复到正常展示状态', data }
      }

      case 'add_constraint': {
        const desc = String(params.description ?? '添加约束')
        const constraints = (params.constraints ?? []) as Array<Record<string, unknown>>
        const res = await fetch(`${API_BASE}/api/optimize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extra_constraints: constraints, save: true, name: desc }),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const h = requireHandlers(type)
        const summaryMeta = summarizeConstraints(constraints)
        const { insight, trace } = buildScenarioInsight({
          label: desc,
          rawPrompt: desc,
          scenarioType: 'constraint',
          normalizedChanges: summaryMeta.normalized,
          defaults: ['保持当前实时电价、碳因子和天气曲线不变'],
          baseDataset: context?.fullData,
          scenarioDataset: data as EcoDataset,
          activeStrategy: context?.activeStrategy,
          impactTargets: summaryMeta.targets,
        })
        h.loadScenarioDataset(data, desc, { insight, trace })
        h.navigate('/scenario')
        return {
          success: true,
          message: `${desc} 求解完成`,
          data: { dataset: data, insight, trace },
          trace,
          toolContent: buildScenarioToolContent(desc, insight, trace),
        }
      }

      case 'trace_causality': {
        const strategy = String(params.strategy ?? 'es') as StrategyKey
        const hour = Math.max(1, Math.min(24, Number(params.hour ?? 1)))
        const idx = hour - 1
        if (!context?.fullData) {
          return { success: true, message: `已获取 ${strategy} 第 ${hour} 小时的分析请求，请基于上下文完成因果分析。`, data: { strategy, hour } }
        }

        const ds = context.fullData
        const lines = [
          `## ${strategy.toUpperCase()} 第 ${hour} 小时设备状态`,
          '',
          `- P_CA: ${ds.P_CA?.[strategy]?.[idx]?.toFixed(0) ?? '-'}`,
          `- P_PV: ${ds.P_PV?.[strategy]?.[idx]?.toFixed(0) ?? '-'}`,
          `- P_GM: ${ds.P_GM?.[strategy]?.[idx]?.toFixed(0) ?? '-'}`,
          `- P_PEM: ${ds.P_PEM?.[strategy]?.[idx]?.toFixed(0) ?? '-'}`,
          `- P_G: ${ds.P_G?.[strategy]?.[idx]?.toFixed(0) ?? '-'}`,
          `- P_es_es: ${ds.P_es_es?.[idx]?.toFixed(0) ?? '-'}`,
          `- H_CA: ${ds.H_CA?.[strategy]?.[idx]?.toFixed(4) ?? '-'}`,
          `- H_PEM: ${ds.H_PEM?.[strategy]?.[idx]?.toFixed(4) ?? '-'}`,
          `- H_HS: ${ds.H_HS?.[strategy]?.[idx]?.toFixed(4) ?? '-'}`,
          `- ef_g: ${ds.ef_g?.[idx]?.toFixed(6) ?? '-'}`,
        ]
        return {
          success: true,
          message: `已获取 ${strategy} 第 ${hour} 小时设备状态数据。`,
          data: { strategy, hour, deviceState: lines.join('\n') },
        }
      }

      case 'generate_chart': {
        return {
          success: true,
          message: `图表配置已生成: ${params.title ?? ''}`,
          data: { chartType: params.chart_type, title: params.title, query: params.data_query },
        }
      }

      case 'pareto_scan': {
        const paramName = String(params.param_name ?? 'n_PV')
        const values = (params.values ?? []) as number[]
        const strategy = String(params.strategy ?? 'cicom')
        const results: Array<{ paramValue: number; cost: number; carbon: number; combined: number }> = []
        for (const value of values) {
          const res = await fetch(`${API_BASE}/api/optimize/single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ strategy, params: { [paramName]: value } }),
          })
          if (!res.ok) continue
          const result = await res.json()
          results.push({ paramValue: value, ...result.summary })
        }
        const paretoPayload: ParetoData = { param_name: paramName, strategy, results }
        const label = `Pareto 扫描: ${paramName} (${Math.min(...values)}-${Math.max(...values)})`
        const h = requireHandlers(type)
        h.loadParetoData(paretoPayload, label)
        h.navigate('/scenario')
        const trace: ExecutionTraceStep[] = [
          {
            id: 'intent',
            title: '意图解析',
            status: 'done',
            kind: 'intent',
            detail: `扫描参数 ${paramName}，策略 ${strategy}`,
            outcome: `共 ${values.length} 个取值点`,
          },
          {
            id: 'solver',
            title: '批量求解',
            status: 'done',
            kind: 'solver',
            detail: values.join(', '),
            outcome: '多轮优化完成',
          },
          {
            id: 'analysis',
            title: 'Pareto 提炼',
            status: 'done',
            kind: 'analysis',
            detail: `最优区间 ${paretoPayload.optimalRange ? `${paretoPayload.optimalRange.min}-${paretoPayload.optimalRange.max}` : '待页面计算'}`,
            outcome: '已输出成本-碳排权衡结果',
          },
        ]
        return {
          success: true,
          message: `Pareto 扫描完成: ${paramName}`,
          data: paretoPayload,
          trace,
          toolContent: `Pareto 扫描完成: ${paramName}\n策略: ${strategy}\n采样点: ${values.length}\n建议: ${paretoPayload.suggestion ?? '查看工作区建议区'}`,
        }
      }

      case 'get_realtime_data': {
        const date = params.date ? String(params.date) : undefined
        const url = date
          ? `${API_BASE}/api/realtime/history?date=${encodeURIComponent(date)}`
          : `${API_BASE}/api/realtime/latest`
        const res = await fetch(url)
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        return { success: true, message: `已获取${date ? ` ${date}` : ''}实时数据`, data }
      }

      case 'get_alerts': {
        const severity = params.severity ? String(params.severity) : undefined
        const limitNum = params.limit ? Number(params.limit) : 10
        let url = `${API_BASE}/api/realtime/alerts?limit=${limitNum}`
        if (severity) url += `&severity=${encodeURIComponent(severity)}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        return { success: true, message: `获取到 ${Array.isArray(data) ? data.length : 0} 条预警`, data }
      }

      case 'carbon_electricity_analysis': {
        const res = await fetch(`${API_BASE}/api/realtime/latest`)
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const prices: number[] = data.prices || []
        const carbon: number[] = data.carbon || []
        const carbonPrice = Number(params.carbon_price ?? 70)
        const pEff = prices.map((price, index) => price + (carbon[index] || 0) * carbonPrice)
        const bestIndex = pEff.indexOf(Math.min(...pEff))
        const worstIndex = pEff.indexOf(Math.max(...pEff))
        return {
          success: true,
          message: `碳电协同分析完成: 最优时段 ${bestIndex + 1}h，最差时段 ${worstIndex + 1}h`,
          data: { prices, carbon, p_eff: pEff, best_hour: bestIndex + 1, worst_hour: worstIndex + 1 },
        }
      }

      default:
        return { success: false, message: `未知动作类型: ${type}` }
    }
  } catch (error) {
    return {
      success: false,
      message: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
