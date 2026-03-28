/**
 * EcoClaw：展示 Agent 结果
 * - emergencyPreviewRun: 应急调度指挥页
 * - scenarioDataset: What-If 推演对比
 * - paretoData: Pareto 前沿分析
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useStrategy } from '@/context/StrategyContext'
import ScenarioCompareChart from '@/components/charts/ScenarioCompareChart'
import DeviceDispatchPlanChart from '@/components/charts/DeviceDispatchPlanChart'
import ParetoFrontierChart from '@/components/charts/ParetoFrontierChart'
import EmergencyDispatchChart from '@/components/charts/EmergencyDispatchChart'
import EmergencyDeltaChart from '@/components/charts/EmergencyDeltaChart'
import InvestmentWorkspaceView from '@/components/workspace/InvestmentWorkspaceView'
import AnomalyWorkspaceView from '@/components/workspace/AnomalyWorkspaceView'
import {
  applyEmergencyRunApi,
  fetchEmergencyRuns,
  restoreEmergencyStateApi,
} from '@/lib/api'
import { exportEmergencyRunWorkbook } from '@/lib/emergencyExport'
import { exportScenarioWorkbook } from '@/lib/scenarioExport'
import { Download, Volume2 } from 'lucide-react'
import type { EmergencyPointDetail, EmergencyRun, ExecutionTraceStep, ScenarioInsight, StrategyKey } from '@/types'

const STRATEGIES: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']
const LABELS: Record<StrategyKey, string> = {
  uci: 'UCI',
  cicos: 'CICOS',
  cicar: 'CICAR',
  cicom: 'CICOM',
  pv: 'PV',
  es: 'ES',
}

function pct(a: number, b: number): string {
  if (b === 0) return '--'
  const value = ((a - b) / b) * 100
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

export default function ScenarioComparePage() {
  const {
    dataset,
    scenarioDataset,
    scenarioLabel,
    scenarioInsight,
    scenarioTrace,
    paretoData,
    paretoLabel,
    datasetLoading,
    emergencyPreviewRun,
    emergencyActiveRun,
    setEmergencyPreviewRun,
    applyEmergencyRunState,
    investmentPlan,
    anomalyPreviewRun,
    anomalyActiveRun,
    setAnomalyPreviewRun,
    applyAnomalyRunState,
    restoreNormalDatasetState,
    datasetMeta,
  } = useStrategy()
  const [history, setHistory] = useState<EmergencyRun[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [activePoint, setActivePoint] = useState<EmergencyPointDetail | null>(null)
  const [detailExpanded, setDetailExpanded] = useState(false)
  const [selectedPlanStrategy, setSelectedPlanStrategy] = useState<StrategyKey>('cicom')
  const [isSpeaking, setIsSpeaking] = useState(false)

  useEffect(() => {
    let disposed = false
    const load = async () => {
      setHistoryLoading(true)
      try {
        const rows = await fetchEmergencyRuns(8)
        if (!disposed) setHistory(rows)
      } catch (error) {
        console.warn('[emergency history]', error)
      } finally {
        if (!disposed) setHistoryLoading(false)
      }
    }
    void load()
    return () => {
      disposed = true
    }
  }, [emergencyPreviewRun, emergencyActiveRun])

  const currentEmergency = emergencyPreviewRun ?? emergencyActiveRun
  const currentAnomaly = anomalyPreviewRun ?? anomalyActiveRun

  useEffect(() => {
    setActivePoint(null)
  }, [currentEmergency?.id])

  useEffect(() => {
    setDetailExpanded(false)
  }, [scenarioLabel, paretoLabel, currentEmergency?.id, currentAnomaly?.id])

  useEffect(() => {
    if (!scenarioInsight?.selectedStrategy) return
    setSelectedPlanStrategy(scenarioInsight.selectedStrategy)
  }, [scenarioInsight?.selectedStrategy])

  const emergencyHistory = useMemo(() => {
    if (!currentEmergency) return history
    const ids = new Set([currentEmergency.id])
    return [currentEmergency, ...history.filter((item) => !ids.has(item.id))]
  }, [currentEmergency, history])

  if (datasetLoading) {
    return <div className="h-full flex items-center justify-center text-text-muted">加载数据中…</div>
  }

  if (currentEmergency) {
    const detail = currentEmergency.detailPayload
    const point = activePoint
    const audit = detail.audit
    const requestedGrid = audit?.requestedReductions?.gridReduction ?? detail.summary.requestedGridReduction ?? 0
    const requestedPv = audit?.requestedReductions?.pvReduction ?? detail.summary.requestedPvReduction ?? 0
    const actualGrid = audit?.actualReductions?.gridReduction ?? detail.summary.actualGridReduction ?? 0
    const actualPv = audit?.actualReductions?.pvReduction ?? detail.summary.actualPvReduction ?? 0
    const actualAdjustments = audit?.actualAdjustments ?? detail.actualEnvelope
    const caReduction = actualAdjustments?.caReduction ?? 0
    const gmLift = actualAdjustments?.gmLift ?? 0
    const pemLift = actualAdjustments?.pemLift ?? 0
    const storageLift = actualAdjustments?.storageLift ?? 0
    const impactScore = detail.impactScore ?? audit?.impactScore ?? 0
    const generationMode = audit?.generationMode ?? detail.meta?.generationMode ?? (currentEmergency.degraded ? 'template_fallback' : 'llm_direct')

    return (
      <div className="h-full min-h-0 overflow-auto" style={{ display: 'grid', gridTemplateRows: 'auto auto auto auto', gap: 12 }}>
        <div className="panel shrink-0">
          <div className="panel-title-bar flex items-center justify-between">
            <span>应急调度指挥页 · {currentEmergency.title}</span>
            <div className="flex items-center gap-2 text-[10px]" style={{ color: '#5a7a9a' }}>
              <span>{currentEmergency.source === 'auto' ? 'AUTO' : 'MANUAL'}</span>
              <span>·</span>
              <span>{renderGenerationLabel(generationMode)}</span>
              <span>·</span>
              <span>{currentEmergency.status}</span>
            </div>
          </div>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1.45fr 1.15fr', gap: 16 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ color: '#e8f4ff', fontSize: 15, fontWeight: 700 }}>{currentEmergency.eventSpec.title}</div>
              <p style={{ color: '#8ba9cc', fontSize: 12, lineHeight: 1.8 }}>
                {currentEmergency.explanation}
              </p>
              <div className="flex flex-wrap gap-2">
                <ModeBadge label={renderGenerationLabel(generationMode)} tone={generationMode === 'template_fallback' ? 'warn' : generationMode === 'llm_corrected' ? 'info' : 'ok'} />
                <ModeBadge label={datasetMeta.emergencyActive && datasetMeta.emergencyRunId === currentEmergency.id ? '已应用到全站' : '仅预览'} tone={datasetMeta.emergencyActive && datasetMeta.emergencyRunId === currentEmergency.id ? 'warn' : 'info'} />
                <ModeBadge label="EMERGENCY MODE" tone="warn" />
                {(currentEmergency.eventSpec.affectedModules || []).map((tag) => (
                  <span key={tag} className="hud-chip" style={{ fontSize: 10 }}>{tag}</span>
                ))}
              </div>
              <div style={{ color: '#69f0ae', fontSize: 12 }}>
                事件参数摘要：{currentEmergency.eventSpec.parameterSummary ?? detail.meta?.parameterSummary ?? '未识别具体幅度，使用默认边界'}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <SummaryCell label="电网请求/实际" value={`${Math.round(requestedGrid * 100)}% / ${Math.round(actualGrid * 100)}%`} accent="#ce93d8" />
              <SummaryCell label="光伏请求/实际" value={`${Math.round(requestedPv * 100)}% / ${Math.round(actualPv * 100)}%`} accent="#c6f135" />
              <SummaryCell label="电解槽降载" value={`${Math.round(caReduction * 100)}%`} accent="#4e9eff" />
              <SummaryCell label="燃机抬升" value={`+${Math.round(gmLift * 100)}%`} accent="#ffb347" />
              <SummaryCell label="PEM 抬升" value={`+${Math.round(pemLift * 100)}%`} accent="#29d4ff" />
              <SummaryCell label="储能抬升" value={`+${Math.round(storageLift * 100)}%`} accent="#ffd740" />
              <SummaryCell label="峰值燃机/PEM" value={`${detail.summary.peakGM.toFixed(0)} / ${detail.summary.peakPEM.toFixed(0)} kW`} accent="#ffb347" />
              <SummaryCell label="最大缺口" value={`${detail.summary.maxGap.toFixed(1)} kW`} accent={detail.summary.maxGap > 25 ? '#ff7043' : '#69f0ae'} />
              <SummaryCell label="冲击指数" value={`${impactScore.toFixed(0)} / 100`} accent="#00d4ff" />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.95fr) minmax(360px, 0.95fr)', gap: 12, alignItems: 'stretch' }}>
          <div className="panel" style={{ height: 640, display: 'grid', gridTemplateRows: 'minmax(0, 1.85fr) minmax(180px, 0.95fr)', minHeight: 640 }}>
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div className="panel-title-bar">4小时应急联动曲线 · 5分钟粒度</div>
              <div style={{ flex: 1, minHeight: 0, padding: 12 }}>
                <EmergencyDispatchChart detail={detail} onPointHover={setActivePoint} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderTop: '1px solid #111b2e' }}>
              <div className="panel-title-bar">相对基线联动增减幅</div>
              <div style={{ flex: 1, minHeight: 0, padding: '0 12px 12px' }}>
                <EmergencyDeltaChart detail={detail} />
              </div>
            </div>
          </div>

          <div className="panel" style={{ height: 640, display: 'flex', flexDirection: 'column', minHeight: 640 }}>
            <div className="panel-title-bar">点位与模块状态</div>
            <div style={{ padding: 16, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 14, flex: 1, minHeight: 0 }}>
              {point ? (
                <div style={{ alignSelf: 'start' }}>
                  <div style={{ color: '#00d4ff', fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 700 }}>
                    {point.label}
                  </div>
                  <div style={{ color: '#5a7a9a', fontSize: 11, marginTop: 4 }}>{point.timestamp}</div>
                  <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                    <PointRow label="电解槽负荷" value={point.P_CA} color="#4e9eff" />
                    <PointRow label="光伏出力" value={point.P_PV} color="#c6f135" />
                    <PointRow label="燃机出力" value={point.P_GM} color="#ffb347" />
                    <PointRow label="PEM 出力" value={point.P_PEM} color="#29d4ff" />
                    <PointRow label="电网供能" value={point.P_G} color="#ce93d8" />
                    <PointRow label="储能支撑" value={point.P_es_es} color="#ffd740" />
                    <PointRow label="供能总量" value={point.supplyTotal} color="#69f0ae" />
                    <PointRow label="剩余缺口" value={point.gap} color={point.gap > 25 ? '#ff7043' : '#69f0ae'} />
                  </div>
                  <div style={{ marginTop: 12, color: point.riskLevel === 'high' ? '#ff7043' : point.riskLevel === 'medium' ? '#ffd740' : '#69f0ae', fontSize: 12, fontWeight: 600 }}>
                    风险等级：{point.riskLevel.toUpperCase()}
                  </div>
                </div>
              ) : (
                <div style={{ color: '#5a7a9a', fontSize: 12 }}>移动鼠标到曲线上查看点位详情。</div>
              )}

              <div style={{ display: 'grid', gap: 8, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
                {(detail.moduleStatus || []).map((status) => (
                  <ModuleLamp key={status.module} status={status} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr) minmax(320px, 0.9fr)', gap: 12 }}>
          <div className="panel">
            <div className="panel-title-bar">事件时间线</div>
            <div style={{ padding: 16, color: '#8ba9cc', fontSize: 12, lineHeight: 1.8 }}>
              <div style={{ display: 'grid', gap: 10 }}>
                {(detail.timeline || []).map((item) => (
                  <div key={`${item.time}-${item.title}`} style={{ borderLeft: '2px solid #00d4ff55', paddingLeft: 12 }}>
                    <div style={{ color: '#00d4ff', fontSize: 11, fontWeight: 700 }}>{item.time} · {item.title}</div>
                    <div style={{ color: '#8ba9cc', marginTop: 4 }}>{item.detail}</div>
                    {item.action ? <div style={{ color: '#5a7a9a', marginTop: 2 }}>动作：{item.action}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title-bar">风险热区</div>
            <div style={{ padding: 16, overflowX: 'auto' }}>
              <RiskMatrixTable items={detail.riskMatrix || []} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-title-bar">操作与历史复用</div>
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded border border-[#00d4ff] bg-[#00d4ff]/12 px-3 py-2 text-xs text-[#00d4ff]"
                  onClick={async () => {
                    const applied = await applyEmergencyRunApi(currentEmergency.id)
                    applyEmergencyRunState(applied.run, applied.dataset.data, applied.dataset.meta)
                    setEmergencyPreviewRun(applied.run)
                  }}
                  disabled={datasetMeta.emergencyActive && datasetMeta.emergencyRunId === currentEmergency.id}
                >
                  {datasetMeta.emergencyActive && datasetMeta.emergencyRunId === currentEmergency.id ? '当前已应用' : '一键应用应急态'}
                </button>
                <button
                  type="button"
                  className="rounded border border-[#ff7043] bg-[#ff7043]/10 px-3 py-2 text-xs text-[#ffb199]"
                  onClick={async () => {
                    const restored = await restoreEmergencyStateApi(currentEmergency.id)
                    restoreNormalDatasetState(restored.baselineDataset.data, restored.baselineDataset.meta)
                    setEmergencyPreviewRun(restored.run)
                  }}
                >
                  回退正常状态
                </button>
                <button
                  type="button"
                  className="rounded border border-[#69f0ae] bg-[#69f0ae]/10 px-3 py-2 text-xs text-[#69f0ae]"
                  onClick={() => exportEmergencyRunWorkbook(currentEmergency)}
                >
                  导出应急数据
                </button>
              </div>

              <div style={{ color: '#5a7a9a', fontSize: 11, marginTop: 6 }}>历史应急方案</div>
              <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                {historyLoading ? (
                  <div style={{ color: '#5a7a9a', fontSize: 12 }}>加载历史应急方案中…</div>
                ) : emergencyHistory.length === 0 ? (
                  <div style={{ color: '#5a7a9a', fontSize: 12 }}>暂无历史应急方案。</div>
                ) : (
                  emergencyHistory.map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      className="rounded border px-3 py-2 text-left transition-colors hover:border-[#00d4ff]/60 hover:bg-[#00d4ff]/6"
                      style={{
                        borderColor: run.id === currentEmergency.id ? '#00d4ff55' : '#1e3256',
                        background: run.id === currentEmergency.id ? 'rgba(0,212,255,0.08)' : 'transparent',
                      }}
                      onClick={() => setEmergencyPreviewRun(run)}
                    >
                      <div style={{ color: '#e8f4ff', fontSize: 12, fontWeight: 600 }}>{run.title}</div>
                      <div style={{ color: '#5a7a9a', fontSize: 10, marginTop: 4 }}>
                        #{run.id} · {run.source} · {run.status} · {run.createdAt}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="panel shrink-0">
          <div className="panel-title-bar">调度原则与说明</div>
          <div style={{ padding: 16, color: '#8ba9cc', fontSize: 12, lineHeight: 1.8 }}>
            <p><b style={{ color: '#4e9eff' }}>优先顺序</b>：{detail.priorityOrder.join(' -> ')}</p>
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {(detail.dispatchPrinciples || detail.keyAnchors).map((item) => (
                <div key={item}>• {item}</div>
              ))}
            </div>
            <p style={{ marginTop: 8, color: '#5a7a9a' }}>
              说明：主图实线为当前应急曲线，虚线为同窗口基线。下方副图展示相对基线的增减幅，用于突出联动效果与比赛展示冲击力。
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (currentAnomaly) {
    return (
      <AnomalyWorkspaceView
        run={currentAnomaly}
        currentAppliedRunId={datasetMeta.anomalyRunId ?? null}
        onSelectRun={setAnomalyPreviewRun}
        onApplyRun={(run, data, meta) => applyAnomalyRunState(run, data, meta)}
        onRestore={(data, meta, run) => {
          restoreNormalDatasetState(data, meta)
          setAnomalyPreviewRun(run ?? null)
        }}
      />
    )
  }

  if (investmentPlan) {
    return <InvestmentWorkspaceView run={investmentPlan} />
  }

  if (!scenarioDataset && !paretoData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="panel" style={{ padding: 32, maxWidth: 760, textAlign: 'center' }}>
          <div className="panel-title-bar" style={{ textAlign: 'center', marginBottom: 16 }}>What-if 调度工作台</div>
          <p style={{ color: '#8ba9cc', fontSize: 13, lineHeight: 1.8 }}>
            当前还没有推演结果。请在右侧 EcoClaw 面板中直接输入自然语言调度问题，优先发起 What-if 推演或约束调度任务。
          </p>
          <div style={{ marginTop: 18, color: '#3d6080', fontSize: 12, display: 'grid', gap: 8 }}>
            <p>推荐从以下问题开始：</p>
            <p style={{ color: '#00d4ff' }}>"如果明天电价上涨 20%，光伏下降 30%，最优调度方案会怎么变？"</p>
            <p style={{ color: '#00d4ff' }}>"限制 19-21 时段电网购电不超过 3000kW，成本和碳排会增加多少？"</p>
            <p style={{ color: '#00d4ff' }}>"如果只允许成本增加不超过 3%，还能再降多少碳？"</p>
            <p style={{ color: '#5a7a9a' }}>应急、异常、投资能力仍保留，但现在 What-if 是 EcoClaw 的默认主工作流。</p>
          </div>
        </div>
      </div>
    )
  }

  if (paretoData) {
    return (
      <div className="h-full min-h-0 overflow-auto" style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 12 }}>
        <div className="panel shrink-0">
          <div className="panel-title-bar flex items-center justify-between">
            <span>Pareto 前沿 · {paretoLabel ?? '参数扫描'}</span>
            <span style={{ color: '#3d6080', fontSize: 10, fontWeight: 400 }}>
              成本 vs 碳排 · 最优区间
            </span>
          </div>
        </div>
        <div className="panel min-h-0" style={{ minHeight: 280 }}>
          <ParetoFrontierChart data={paretoData} />
        </div>
        <div className="panel shrink-0">
          <div className="panel-title-bar">建议</div>
          <div style={{ padding: 16, color: '#8ba9cc', fontSize: 13, lineHeight: 1.8 }}>
            <p style={{ color: '#69f0ae', fontWeight: 600 }}>
              {paretoData.suggestion ?? '暂无建议'}
            </p>
            <p style={{ marginTop: 8, color: '#3d6080', fontSize: 12 }}>
              绿色标注点为综合指标最优区间。Pareto 扫描对参数进行多轮取值，展示成本-碳排的权衡关系。
            </p>
          </div>
        </div>
      </div>
    )
  }

  const baseSummary = dataset.summary
  const scenSummary = scenarioDataset!.summary as Record<StrategyKey, { cost: number; carbon: number; combined: number }>
  const insight = scenarioInsight ?? buildFallbackScenarioInsight(scenarioLabel ?? 'What-if 推演', baseSummary, scenSummary)
  const trace = scenarioTrace.length > 0 ? scenarioTrace : buildFallbackTrace(insight)
  const topStrategy = insight.comparisonSummary[0]
  const baselineBest = insight.bestStrategyShift.before
  const quickOptions = insight.followupOptions && insight.followupOptions.length > 0
    ? insight.followupOptions
    : (insight.suggestedQuestions.length > 0
      ? insight.suggestedQuestions.map((question, index) => ({
          id: `fallback-${index}`,
          label: question,
          question,
          kind: 'inspect' as const,
        }))
      : [])
  const displayStrategy = (insight.workspaceMode === 'day_plan'
    ? selectedPlanStrategy
    : (insight.selectedStrategy ?? topStrategy?.strategy ?? 'cicom')) as StrategyKey
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

  const handleSpeak = () => {
    if (!canSpeak || !insight.broadcastText) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(insight.broadcastText)
    utterance.lang = 'zh-CN'
    utterance.rate = 1
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    setIsSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }

  return (
    <div className="h-full min-h-0 overflow-auto" style={{ display: 'grid', gridTemplateRows: 'auto auto auto auto auto auto', gap: 12 }}>
      <div className="panel shrink-0">
        <div className="panel-title-bar flex items-center justify-between">
          <span>{insight.workspaceMode === 'day_plan' ? '次日调度工作台' : 'What-if 调度工作台'} · {scenarioLabel ?? 'What-If 推演'}</span>
          <div className="flex items-center gap-2">
            <span style={{ color: '#3d6080', fontSize: 10, fontWeight: 400 }}>
              {insight.workspaceMode === 'day_plan' ? '明日计划调度引擎' : '自然语言调度引擎'}
            </span>
            <button
              type="button"
              onClick={() => exportScenarioWorkbook(dataset, scenarioDataset!, scenarioLabel ?? undefined)}
              className="inline-flex items-center gap-1 rounded border border-[#1e3256] bg-[#111b2e] px-3 py-1.5 text-[11px] text-[#8ba9cc] transition-colors hover:border-[#00d4ff]/50 hover:text-[#e8f4ff]"
            >
              <Download size={12} />
              导出 Excel
            </button>
            <button
              type="button"
              onClick={handleSpeak}
              disabled={!insight.broadcastText || isSpeaking || !canSpeak}
              className="rounded border border-[#1e3256] bg-[#111b2e] px-3 py-1.5 text-[11px] text-[#8ba9cc] transition-colors hover:border-[#00d4ff]/50 hover:text-[#e8f4ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {canSpeak ? (isSpeaking ? '播报中...' : '语音播报') : '仅文案'}
            </button>
          </div>
        </div>
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
          <div className="panel" style={{ padding: 16 }}>
            <div style={{ color: '#5a7a9a', fontSize: 10, letterSpacing: 1.2 }}>一句话结论</div>
            <div style={{ color: '#e8f4ff', fontSize: 24, lineHeight: 1.4, fontWeight: 700, marginTop: 10 }}>
              {insight.headline}
            </div>
            <div style={{ color: '#8ba9cc', fontSize: 13, lineHeight: 1.8, marginTop: 10 }}>
              {insight.summary}
            </div>
            <div style={{ color: '#5a7a9a', fontSize: 12, lineHeight: 1.8, marginTop: 10 }}>
              {insight.driverAnalysis}
            </div>
            <div
              className="rounded border"
              style={{ marginTop: 14, borderColor: '#1e3256', background: 'rgba(17,27,46,0.78)', padding: 12 }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div style={{ color: '#00d4ff', fontSize: 11, letterSpacing: 1 }}>语音播报</div>
                  <div style={{ color: '#5a7a9a', fontSize: 11, marginTop: 6 }}>
                    {canSpeak ? '点击后将朗读当前结论摘要。' : '当前浏览器不支持语音播报，将仅保留播报文案。'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSpeak}
                  disabled={!insight.broadcastText || isSpeaking || !canSpeak}
                  className="inline-flex items-center gap-2 rounded border border-[#00d4ff]/45 bg-[#00d4ff]/12 px-4 py-2 text-xs font-semibold text-[#cfefff] transition-colors hover:border-[#00d4ff] hover:bg-[#00d4ff]/18 disabled:cursor-not-allowed disabled:border-[#1e3256] disabled:bg-[#111b2e] disabled:text-[#5a7a9a]"
                  title={canSpeak ? '播报当前结论' : '当前浏览器不支持语音播报'}
                >
                  <Volume2 size={14} />
                  {isSpeaking ? '播报中...' : '播报当前结论'}
                </button>
              </div>
              {insight.broadcastText ? (
                <div style={{ color: '#8ba9cc', fontSize: 12, lineHeight: 1.7, marginTop: 10 }}>
                  {insight.broadcastText}
                </div>
              ) : null}
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(insight.normalizedChanges.length > 0 ? insight.normalizedChanges : ['沿用当前实时参数曲线']).map((item) => (
                <span key={item} className="hud-chip" style={{ fontSize: 10 }}>{item}</span>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <SummaryCell label="当前最优策略" value={topStrategy ? LABELS[topStrategy.strategy] : '--'} accent="#00d4ff" />
            <SummaryCell label="基准最优策略" value={LABELS[baselineBest] ?? '--'} accent="#4e9eff" />
            <SummaryCell label="综合变化" value={topStrategy ? formatPct(topStrategy.deltaCombinedPct) : '--'} accent={topStrategy && topStrategy.deltaCombinedPct <= 0 ? '#69f0ae' : '#ff7043'} />
            <SummaryCell label="成本变化" value={topStrategy ? formatPct(topStrategy.deltaCostPct) : '--'} accent={topStrategy && topStrategy.deltaCostPct <= 0 ? '#69f0ae' : '#ff7043'} />
            <SummaryCell label="碳排变化" value={topStrategy ? formatPct(topStrategy.deltaCarbonPct) : '--'} accent={topStrategy && topStrategy.deltaCarbonPct <= 0 ? '#69f0ae' : '#ff7043'} />
            <SummaryCell label="风险提示" value={insight.riskFlags[0]?.label ?? '无显著风险'} accent={insight.riskFlags.length ? '#ffb347' : '#69f0ae'} />
          </div>
        </div>
      </div>

      {insight.analysisMode === 'followup' && insight.followupQuestion && insight.followupAnswer ? (
        <div className="panel shrink-0">
          <div className="panel-title-bar">当前追问分析</div>
          <div style={{ padding: 16, display: 'grid', gap: 10 }}>
            <div className="rounded border" style={{ borderColor: '#1e3256', background: 'rgba(13,20,34,0.9)', padding: 12 }}>
              <div style={{ color: '#5a7a9a', fontSize: 10, letterSpacing: 1.2 }}>追问问题</div>
              <div style={{ color: '#e8f4ff', fontSize: 16, fontWeight: 700, marginTop: 8 }}>
                {insight.followupQuestion}
              </div>
            </div>
            <div className="rounded border" style={{ borderColor: '#1e3256', background: 'rgba(13,20,34,0.9)', padding: 12 }}>
              <div style={{ color: '#00d4ff', fontSize: 10, letterSpacing: 1.2 }}>追问结论</div>
              <div style={{ color: '#8ba9cc', fontSize: 13, lineHeight: 1.8, marginTop: 8 }}>
                {insight.followupAnswer}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {insight.workspaceMode === 'day_plan' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 0.6fr)', gap: 12 }}>
          <div className="panel min-h-0">
            <div className="panel-title-bar flex items-center justify-between">
              <span>次日设备调度曲线</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportScenarioWorkbook(dataset, scenarioDataset!, scenarioLabel ?? undefined)}
                  className="inline-flex items-center gap-1 rounded border border-[#1e3256] bg-[#111b2e] px-3 py-1.5 text-[11px] text-[#8ba9cc] transition-colors hover:border-[#00d4ff]/50 hover:text-[#e8f4ff]"
                >
                  <Download size={12} />
                  导出 Excel
                </button>
                <button
                  type="button"
                  onClick={handleSpeak}
                  disabled={!insight.broadcastText || isSpeaking || !canSpeak}
                  className="inline-flex items-center gap-1 rounded border border-[#1e3256] bg-[#111b2e] px-3 py-1.5 text-[11px] text-[#8ba9cc] transition-colors hover:border-[#00d4ff]/50 hover:text-[#e8f4ff] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Volume2 size={12} />
                  {isSpeaking ? '播报中...' : '语音播报'}
                </button>
              </div>
            </div>
            <div style={{ padding: 16, height: 420 }}>
              <DeviceDispatchPlanChart dataset={scenarioDataset!} strategy={displayStrategy} />
            </div>
          </div>
          <div className="panel shrink-0">
            <div className="panel-title-bar">计划说明</div>
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <div className="rounded border" style={{ borderColor: '#1e3256', background: 'rgba(13,20,34,0.9)', padding: 12 }}>
                <div style={{ color: '#5a7a9a', fontSize: 10, letterSpacing: 1.2 }}>当前展示策略</div>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {STRATEGIES.map((strategy) => (
                    <button
                      key={strategy}
                      type="button"
                      onClick={() => setSelectedPlanStrategy(strategy)}
                      className="rounded border px-3 py-1.5 text-[11px] transition-colors"
                      style={{
                        borderColor: displayStrategy === strategy ? '#00d4ff' : '#1e3256',
                        background: displayStrategy === strategy ? 'rgba(0,212,255,0.1)' : 'rgba(17,27,46,0.7)',
                        color: displayStrategy === strategy ? '#e8f4ff' : '#8ba9cc',
                      }}
                    >
                      {LABELS[strategy]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded border" style={{ borderColor: '#1e3256', background: 'rgba(13,20,34,0.9)', padding: 12 }}>
                <div style={{ color: '#00d4ff', fontSize: 11, letterSpacing: 1 }}>次日计划摘要</div>
                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  <div style={{ color: '#8ba9cc', fontSize: 12, lineHeight: 1.7 }}>{insight.summary}</div>
                  <div style={{ color: '#5a7a9a', fontSize: 12, lineHeight: 1.7 }}>{insight.driverAnalysis}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)', gap: 12 }}>
        <div className="panel shrink-0">
          <div className="panel-title-bar flex items-center justify-between">
            <span>策略排名变化区</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportScenarioWorkbook(dataset, scenarioDataset!, scenarioLabel ?? undefined)}
                className="inline-flex items-center gap-1 rounded border border-[#1e3256] bg-[#111b2e] px-3 py-1.5 text-[11px] text-[#8ba9cc] transition-colors hover:border-[#00d4ff]/50 hover:text-[#e8f4ff]"
              >
                <Download size={12} />
                导出 Excel
              </button>
              <button
                type="button"
                onClick={handleSpeak}
                disabled={!insight.broadcastText || isSpeaking || !canSpeak}
                className="inline-flex items-center gap-1 rounded border border-[#1e3256] bg-[#111b2e] px-3 py-1.5 text-[11px] text-[#8ba9cc] transition-colors hover:border-[#00d4ff]/50 hover:text-[#e8f4ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Volume2 size={12} />
                {isSpeaking ? '播报中...' : '语音播报'}
              </button>
            </div>
          </div>
          <div style={{ padding: 16, display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto', paddingRight: 10 }}>
            {insight.comparisonSummary.map((item) => (
              <div key={item.strategy} className="rounded border" style={{ borderColor: '#1e3256', background: 'rgba(13,20,34,0.9)', padding: 12 }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div style={{ color: '#e8f4ff', fontWeight: 700, fontSize: 14 }}>{LABELS[item.strategy]}</div>
                    <div style={{ color: '#5a7a9a', fontSize: 11 }}>综合排名 #{item.rank}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: item.deltaCombinedPct <= 0 ? '#69f0ae' : '#ff7043', fontSize: 15, fontWeight: 700 }}>
                      {formatPct(item.deltaCombinedPct)}
                    </div>
                    <div style={{ color: '#5a7a9a', fontSize: 10 }}>combined</div>
                  </div>
                </div>
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  <MiniMetric label="成本" value={formatPct(item.deltaCostPct)} tone={item.deltaCostPct <= 0 ? 'good' : 'bad'} />
                  <MiniMetric label="碳排" value={formatPct(item.deltaCarbonPct)} tone={item.deltaCarbonPct <= 0 ? 'good' : 'bad'} />
                  <MiniMetric label="综合" value={formatPct(item.deltaCombinedPct)} tone={item.deltaCombinedPct <= 0 ? 'good' : 'bad'} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel shrink-0">
          <div className="panel-title-bar">Agent 建议与下一步追问区</div>
          <div style={{ padding: 16, display: 'grid', gap: 10 }}>
            <div className="rounded border" style={{ borderColor: '#1e3256', background: 'rgba(13,20,34,0.9)', padding: 12 }}>
              <div style={{ color: '#00d4ff', fontSize: 11, letterSpacing: 1 }}>调度建议</div>
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                {insight.recommendations.map((item) => (
                  <div key={item} style={{ color: '#8ba9cc', fontSize: 12, lineHeight: 1.7 }}>{item}</div>
                ))}
              </div>
            </div>
            <div className="rounded border" style={{ borderColor: '#1e3256', background: 'rgba(13,20,34,0.9)', padding: 12 }}>
              <div style={{ color: '#5a7a9a', fontSize: 11, letterSpacing: 1 }}>继续分析</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {quickOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('agent:ask', { detail: { prompt: option.question } }))}
                    className="rounded border border-[#1e3256] bg-[#111b2e] px-3 py-2 text-left text-xs text-[#8ba9cc] transition-colors hover:border-[#00d4ff]/50 hover:text-[#e8f4ff]"
                  >
                    <div>{option.label}</div>
                    <div style={{ color: '#5a7a9a', fontSize: 10, marginTop: 4 }}>
                      {option.kind === 'optimize' ? '会触发新的二次求解' : '会基于当前场景继续深挖'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <div className="panel">
          <div className="panel-title-bar">关键时段影响区</div>
          <div style={{ padding: 16, display: 'grid', gap: 8 }}>
            {insight.keyHours.length > 0 ? insight.keyHours.map((item) => (
              <div key={item.hour} className="rounded border" style={{ borderColor: '#1e3256', background: 'rgba(13,20,34,0.86)', padding: 12 }}>
                <div className="flex items-center justify-between gap-2">
                  <div style={{ color: '#e8f4ff', fontWeight: 700 }}>{item.label}</div>
                  <div style={{ color: '#00d4ff', fontSize: 11 }}>影响分 {item.changeScore.toFixed(0)}</div>
                </div>
                <div style={{ color: '#8ba9cc', fontSize: 12, marginTop: 8, lineHeight: 1.7 }}>{item.summary}</div>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <MetricChip label="购电" value={`${formatSignedValue(item.gridDelta)} kW`} />
                  <MetricChip label="光伏" value={`${formatSignedValue(item.pvDelta)} kW`} />
                  <MetricChip label="电解槽" value={`${formatSignedValue(item.caDelta)} kW`} />
                  <MetricChip label="PEM" value={`${formatSignedValue(item.pemDelta)} kW`} />
                </div>
              </div>
            )) : (
              <div style={{ color: '#5a7a9a', fontSize: 12 }}>当前结果未提取到关键影响时段。</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title-bar">设备调度差异区</div>
          <div style={{ padding: 16, display: 'grid', gap: 8 }}>
            {insight.dispatchHighlights.length > 0 ? insight.dispatchHighlights.map((item) => (
              <div key={`${item.metric}-${item.label}`} className="rounded border" style={{ borderColor: '#1e3256', background: 'rgba(13,20,34,0.86)', padding: 12 }}>
                <div className="flex items-center justify-between gap-2">
                  <div style={{ color: '#e8f4ff', fontWeight: 700 }}>{item.label}</div>
                  <div style={{ color: Math.abs(item.delta) < 1 ? '#8ba9cc' : item.delta <= 0 ? '#69f0ae' : '#ffb347', fontSize: 13, fontWeight: 700 }}>
                    {formatSignedValue(item.delta)} kW
                  </div>
                </div>
                <div style={{ color: '#5a7a9a', fontSize: 11, marginTop: 5 }}>参考策略 {LABELS[item.strategy]}</div>
                <div style={{ color: '#8ba9cc', fontSize: 12, marginTop: 8, lineHeight: 1.7 }}>{item.summary}</div>
              </div>
            )) : (
              <div style={{ color: '#5a7a9a', fontSize: 12 }}>当前结果未提取到显著设备补偿差异。</div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <div className="panel">
          <div className="panel-title-bar">执行轨迹区</div>
          <div style={{ padding: 16, display: 'grid', gap: 8 }}>
            {trace.map((step) => (
              <div key={step.id} className="rounded border" style={{ borderColor: '#1e3256', background: 'rgba(13,20,34,0.86)', padding: 12 }}>
                <div className="flex items-center justify-between gap-2">
                  <div style={{ color: '#e8f4ff', fontWeight: 700 }}>{step.title}</div>
                  <div style={{ color: step.status === 'error' ? '#ff7043' : step.status === 'running' ? '#00d4ff' : '#69f0ae', fontSize: 10 }}>
                    {step.status.toUpperCase()}
                  </div>
                </div>
                {step.detail ? <div style={{ color: '#8ba9cc', fontSize: 12, marginTop: 8, lineHeight: 1.7 }}>{step.detail}</div> : null}
                {step.outcome ? <div style={{ color: '#5a7a9a', fontSize: 11, marginTop: 6 }}>{step.outcome}</div> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title-bar">基准 vs 推演 对比图</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, padding: 16, height: 420 }}>
            <ScenarioCompareChart baseSummary={baseSummary} scenarioSummary={scenSummary} metric="cost" />
            <ScenarioCompareChart baseSummary={baseSummary} scenarioSummary={scenSummary} metric="carbon" />
            <ScenarioCompareChart baseSummary={baseSummary} scenarioSummary={scenSummary} metric="combined" />
          </div>
        </div>
      </div>

      <div className="panel shrink-0">
        <div className="panel-title-bar flex items-center justify-between">
          <span>明细表与对比数据</span>
          <button
            type="button"
            onClick={() => setDetailExpanded((value) => !value)}
            className="rounded border border-[#1e3256] bg-[#111b2e] px-3 py-1.5 text-[11px] text-[#8ba9cc] transition-colors hover:border-[#00d4ff]/50 hover:text-[#e8f4ff]"
          >
            {detailExpanded ? '收起' : '展开'}
          </button>
        </div>
        {detailExpanded ? (
          <div className="overflow-x-auto" style={{ padding: 16 }}>
            <table className="w-full border-collapse" style={{ fontSize: 12, fontFamily: "'Share Tech Mono', monospace" }}>
              <thead>
                <tr>
                  <th style={thStyle}>策略</th>
                  <th style={thStyle}>基准成本</th>
                  <th style={thStyle}>推演成本</th>
                  <th style={thStyle}>变化</th>
                  <th style={thStyle}>基准碳排</th>
                  <th style={thStyle}>推演碳排</th>
                  <th style={thStyle}>变化</th>
                  <th style={thStyle}>基准综合</th>
                  <th style={thStyle}>推演综合</th>
                  <th style={thStyle}>变化</th>
                </tr>
              </thead>
              <tbody>
                {STRATEGIES.map((sk) => {
                  const base = baseSummary[sk]
                  const scenario = scenSummary?.[sk]
                  if (!base || !scenario) return null
                  return (
                    <tr key={sk}>
                      <td style={tdStyle}>{LABELS[sk]}</td>
                      <td style={tdNumStyle}>{base.cost.toFixed(0)}</td>
                      <td style={tdNumStyle}>{scenario.cost.toFixed(0)}</td>
                      <td style={{ ...tdNumStyle, color: scenario.cost <= base.cost ? '#69f0ae' : '#ff7043' }}>{pct(scenario.cost, base.cost)}</td>
                      <td style={tdNumStyle}>{base.carbon.toFixed(2)}</td>
                      <td style={tdNumStyle}>{scenario.carbon.toFixed(2)}</td>
                      <td style={{ ...tdNumStyle, color: scenario.carbon <= base.carbon ? '#69f0ae' : '#ff7043' }}>{pct(scenario.carbon, base.carbon)}</td>
                      <td style={tdNumStyle}>{base.combined.toFixed(2)}</td>
                      <td style={tdNumStyle}>{scenario.combined.toFixed(2)}</td>
                      <td style={{ ...tdNumStyle, color: scenario.combined <= base.combined ? '#69f0ae' : '#ff7043' }}>{pct(scenario.combined, base.combined)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: 16, color: '#5a7a9a', fontSize: 12 }}>
            当前首屏优先展示结论、关键时段和设备差异。展开后可查看完整策略对比明细。
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCell({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="panel" style={{ padding: 12 }}>
      <div style={{ color: '#5a7a9a', fontSize: 10 }}>{label}</div>
      <div style={{ color: accent, fontFamily: "'Rajdhani', sans-serif", fontSize: 22, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </div>
  )
}

function PointRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: '#8ba9cc', fontSize: 11 }}>{label}</span>
      <span style={{ color, fontFamily: "'Rajdhani', sans-serif", fontSize: 16, fontWeight: 700 }}>
        {value.toFixed(1)}
      </span>
    </div>
  )
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? '#69f0ae' : tone === 'bad' ? '#ff7043' : '#8ba9cc'
  return (
    <div className="rounded border" style={{ borderColor: '#1e3256', background: 'rgba(17,27,46,0.7)', padding: '8px 10px' }}>
      <div style={{ color: '#5a7a9a', fontSize: 10 }}>{label}</div>
      <div style={{ color, fontSize: 13, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  )
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="hud-chip" style={{ fontSize: 10 }}>
      {label} {value}
    </span>
  )
}

function formatPct(value: number) {
  if (!Number.isFinite(value)) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function formatSignedValue(value: number) {
  if (!Number.isFinite(value)) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(0)}`
}

function buildFallbackScenarioInsight(
  label: string,
  baseSummary: Record<StrategyKey, { cost: number; carbon: number; combined: number }>,
  scenarioSummary: Record<StrategyKey, { cost: number; carbon: number; combined: number }>,
): ScenarioInsight {
  const ranking = STRATEGIES.map((strategy) => ({
    strategy,
    cost: scenarioSummary[strategy]?.cost ?? 0,
    carbon: scenarioSummary[strategy]?.carbon ?? 0,
    combined: scenarioSummary[strategy]?.combined ?? 0,
    rank: 0,
    deltaCost: (scenarioSummary[strategy]?.cost ?? 0) - (baseSummary[strategy]?.cost ?? 0),
    deltaCarbon: (scenarioSummary[strategy]?.carbon ?? 0) - (baseSummary[strategy]?.carbon ?? 0),
    deltaCombined: (scenarioSummary[strategy]?.combined ?? 0) - (baseSummary[strategy]?.combined ?? 0),
    deltaCostPct: percentDelta((scenarioSummary[strategy]?.cost ?? 0), (baseSummary[strategy]?.cost ?? 0)),
    deltaCarbonPct: percentDelta((scenarioSummary[strategy]?.carbon ?? 0), (baseSummary[strategy]?.carbon ?? 0)),
    deltaCombinedPct: percentDelta((scenarioSummary[strategy]?.combined ?? 0), (baseSummary[strategy]?.combined ?? 0)),
  })).sort((a, b) => a.combined - b.combined).map((item, index) => ({ ...item, rank: index + 1 }))

  const baselineBest = [...STRATEGIES].sort((a, b) => baseSummary[a].combined - baseSummary[b].combined)[0]
  const currentBest = ranking[0]?.strategy ?? baselineBest

  return {
    intent: {
      rawPrompt: label,
      normalizedPrompt: label,
      scenarioType: 'whatif',
      impactTargets: ['综合调度'],
    },
    normalizedChanges: ['已执行场景推演'],
    appliedDefaults: ['未补充结构化 insight，采用页面兜底分析'],
    comparisonSummary: ranking,
    bestStrategyShift: {
      before: baselineBest,
      after: currentBest,
      changed: baselineBest !== currentBest,
      reason: '基于综合指标排序自动生成',
    },
    keyHours: [],
    dispatchHighlights: [],
    riskFlags: [],
    headline: `${LABELS[currentBest]} 为当前综合最优策略。`,
    summary: '当前结果由页面根据基准与推演汇总指标自动生成。',
    driverAnalysis: '如需更细的时段归因，可继续触发因果追溯或重新发起带约束的推演。',
    recommendations: ['继续查看关键时段、购电压力与约束边界。'],
    suggestedQuestions: ['为什么最优策略变了？', '哪几个时段购电压力最大？'],
    workspaceMode: 'whatif',
    selectedStrategy: currentBest,
    analysisDepth: 0,
    analysisHistory: [],
    followupOptions: [],
    broadcastText: `${LABELS[currentBest]} 为当前综合最优策略。当前结果由页面根据基准与推演汇总指标自动生成。`,
  }
}

function buildFallbackTrace(insight: ScenarioInsight): ExecutionTraceStep[] {
  return [
    {
      id: 'fallback-intent',
      title: '意图解析',
      status: 'done',
      detail: insight.intent.normalizedPrompt,
      outcome: '已恢复推演工作区',
    },
    {
      id: 'fallback-analysis',
      title: '结果归纳',
      status: 'done',
      detail: insight.summary,
      outcome: '页面使用已有数据完成兜底分析',
    },
  ]
}

function percentDelta(next: number, prev: number) {
  if (!prev) return 0
  return ((next - prev) / prev) * 100
}

function renderGenerationLabel(mode: string) {
  if (mode === 'template_fallback') return '模板兜底'
  if (mode === 'llm_corrected') return 'LLM生成·校验修正'
  return 'LLM生成'
}

function ModeBadge({ label, tone }: { label: string; tone: 'ok' | 'info' | 'warn' }) {
  const palette = tone === 'warn'
    ? { color: '#ffb199', border: '#ff704355', bg: 'rgba(255,112,67,0.12)' }
    : tone === 'ok'
      ? { color: '#69f0ae', border: '#69f0ae55', bg: 'rgba(105,240,174,0.12)' }
      : { color: '#00d4ff', border: '#00d4ff55', bg: 'rgba(0,212,255,0.12)' }
  return (
    <span style={{ fontSize: 10, color: palette.color, border: `1px solid ${palette.border}`, background: palette.bg, borderRadius: 6, padding: '3px 8px' }}>
      {label}
    </span>
  )
}

function ModuleLamp({ status }: { status: NonNullable<EmergencyRun['detailPayload']['moduleStatus']>[number] }) {
  const color = status.level === 'red' ? '#ff7043' : status.level === 'amber' ? '#ffd740' : '#69f0ae'
  return (
    <div className="rounded border" style={{ borderColor: `${color}33`, background: `${color}10`, padding: 10 }}>
      <div className="flex items-center gap-2">
        <span style={{ width: 8, height: 8, borderRadius: '999px', background: color, boxShadow: `0 0 14px ${color}` }} />
        <span style={{ color: '#e8f4ff', fontSize: 12, fontWeight: 600 }}>{status.module}</span>
        <span style={{ color, fontSize: 10 }}>{status.title}</span>
      </div>
      <div style={{ color: '#8ba9cc', fontSize: 11, marginTop: 6 }}>{status.detail}</div>
      <div style={{ color: '#5a7a9a', fontSize: 10, marginTop: 4 }}>
        当前值：{status.currentValue?.toFixed(1) ?? '--'} {status.unit ?? ''}
      </div>
      {status.suggestion ? <div style={{ color: '#69f0ae', fontSize: 10, marginTop: 4 }}>建议：{status.suggestion}</div> : null}
    </div>
  )
}

function RiskMatrixTable({ items }: { items: NonNullable<EmergencyRun['detailPayload']['riskMatrix']> }) {
  const modules = Array.from(new Set(items.map((item) => item.module)))
  const windows = Array.from(new Set(items.map((item) => item.windowLabel)))
  return (
    <table className="w-full border-collapse" style={{ fontSize: 11 }}>
      <thead>
        <tr>
          <th style={matrixHeadStyle}>模块</th>
          {windows.map((window) => (
            <th key={window} style={matrixHeadStyle}>{window}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {modules.map((module) => (
          <tr key={module}>
            <td style={matrixCellStyle}>{module}</td>
            {windows.map((window) => {
              const cell = items.find((item) => item.module === module && item.windowLabel === window)
              const color = cell?.level === 'high' ? '#ff7043' : cell?.level === 'medium' ? '#ffd740' : '#69f0ae'
              return (
                <td key={`${module}-${window}`} style={{ ...matrixCellStyle, color, background: `${color}12` }}>
                  <div style={{ fontWeight: 700 }}>{cell?.score ?? '--'}</div>
                  <div style={{ color: '#5a7a9a', fontSize: 10 }}>{cell?.reason ?? '--'}</div>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const thStyle: CSSProperties = {
  padding: '10px 10px',
  textAlign: 'right',
  color: '#8ba9cc',
  borderBottom: '1px solid #1e3256',
  fontWeight: 600,
  fontSize: 11,
}

const tdStyle: CSSProperties = {
  padding: '8px 10px',
  color: '#8ba9cc',
  borderBottom: '1px solid #111b2e',
}

const tdNumStyle: CSSProperties = {
  padding: '8px 10px',
  textAlign: 'right',
  color: '#e8f4ff',
  borderBottom: '1px solid #111b2e',
  fontVariantNumeric: 'tabular-nums',
}

const matrixHeadStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #1e3256',
  color: '#8ba9cc',
  textAlign: 'center',
}

const matrixCellStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #111b2e',
  textAlign: 'center',
  verticalAlign: 'top',
}
