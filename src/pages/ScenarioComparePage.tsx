/**
 * EcoClaw：展示 Agent 结果
 * - emergencyPreviewRun: 应急调度指挥页
 * - scenarioDataset: What-If 推演对比
 * - paretoData: Pareto 前沿分析
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useStrategy } from '@/context/StrategyContext'
import ScenarioCompareChart from '@/components/charts/ScenarioCompareChart'
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
import type { EmergencyPointDetail, EmergencyRun, StrategyKey } from '@/types'

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
        <div className="panel" style={{ padding: 32, maxWidth: 640, textAlign: 'center' }}>
          <div className="panel-title-bar" style={{ textAlign: 'center', marginBottom: 16 }}>EcoClaw</div>
          <p style={{ color: '#8ba9cc', fontSize: 13, lineHeight: 1.8 }}>
            暂无工作成果。请在右侧 EcoClaw 面板中发起 What-If、Pareto 或应急调度任务。
          </p>
          <div style={{ marginTop: 16, color: '#3d6080', fontSize: 12 }}>
            <p>示例指令：</p>
            <p style={{ color: '#00d4ff' }}>"如果光伏组件数量增加到 20000，碳交易价格提高到 150 元/tCO2"</p>
            <p style={{ color: '#00d4ff' }}>"限制 19-21 时段电网购电不超过 3000kW"</p>
            <p style={{ color: '#00d4ff' }}>"分析光伏组件数量从 5000 到 30000 时成本和碳排放的变化趋势"</p>
            <p style={{ color: '#00d4ff' }}>"台风来了，电网故障，购电下降，光伏出力也下降，请生成应急预案"</p>
            <p style={{ color: '#00d4ff' }}>"如果把厂区的光伏组件从 2000 增加到 5000，这笔投资几年后回本？"</p>
            <p style={{ color: '#00d4ff' }}>"燃气轮机温度异常升高，请生成设备异常指挥方案"</p>
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

  return (
    <div className="h-full min-h-0 overflow-auto" style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 12 }}>
      <div className="panel shrink-0">
        <div className="panel-title-bar flex items-center justify-between">
          <span>EcoClaw · {scenarioLabel ?? 'What-If 推演'}</span>
          <span style={{ color: '#3d6080', fontSize: 10, fontWeight: 400 }}>
            基准 vs 推演
          </span>
        </div>
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
      </div>

      <div className="panel shrink-0" style={{ minHeight: 180 }}>
        <div className="panel-title-bar">基准 vs 推演 对比图</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: 16, height: 160 }}>
          <ScenarioCompareChart baseSummary={baseSummary} scenarioSummary={scenSummary} metric="cost" />
          <ScenarioCompareChart baseSummary={baseSummary} scenarioSummary={scenSummary} metric="carbon" />
          <ScenarioCompareChart baseSummary={baseSummary} scenarioSummary={scenSummary} metric="combined" />
        </div>
      </div>

      <div className="panel min-h-0 flex flex-col">
        <div className="panel-title-bar">推演说明</div>
        <div style={{ flex: 1, padding: 16, color: '#8ba9cc', fontSize: 13, lineHeight: 1.8 }}>
          <p><b style={{ color: '#4e9eff' }}>基准</b>：系统默认参数下的优化结果，所有情景对比共用同一套基准。</p>
          <p style={{ marginTop: 8 }}>当前推演场景：<b style={{ color: '#00d4ff' }}>{scenarioLabel}</b></p>
          <p style={{ marginTop: 8 }}>
            表格中绿色数值表示推演结果优于基准，红色表示劣于基准。您可以在右侧 Agent 中继续修改参数进行新一轮推演。
          </p>
        </div>
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
