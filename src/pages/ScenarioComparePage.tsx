/**
 * Agent 工作区：展示 Agent 工作成果
 * - 有 scenarioDataset：What-If 推演 基准 vs 推演 表格+图表
 * - 有 paretoData：Pareto 前沿散点图 + 最优区间建议
 */
import { useStrategy } from '@/context/StrategyContext'
import ScenarioCompareChart from '@/components/charts/ScenarioCompareChart'
import ParetoFrontierChart from '@/components/charts/ParetoFrontierChart'
import type { StrategyKey } from '@/types'

const STRATEGIES: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']
const LABELS: Record<StrategyKey, string> = {
  uci: 'UCI', cicos: 'CICOS', cicar: 'CICAR',
  cicom: 'CICOM', pv: 'PV', es: 'ES',
}

function pct(a: number, b: number): string {
  if (b === 0) return '--'
  const v = ((a - b) / b) * 100
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

export default function ScenarioComparePage() {
  const { dataset, scenarioDataset, scenarioLabel, paretoData, paretoLabel, datasetLoading } = useStrategy()

  if (datasetLoading) {
    return <div className="h-full flex items-center justify-center text-text-muted">加载数据中…</div>
  }

  if (!scenarioDataset && !paretoData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="panel" style={{ padding: 32, maxWidth: 520, textAlign: 'center' }}>
          <div className="panel-title-bar" style={{ textAlign: 'center', marginBottom: 16 }}>Agent 工作区</div>
          <p style={{ color: '#8ba9cc', fontSize: 13, lineHeight: 1.8 }}>
            暂无工作成果。请在右侧 Agent 面板中使用自然语言发起 What-If 推演或 Pareto 参数扫描。
          </p>
          <div style={{ marginTop: 16, color: '#3d6080', fontSize: 12 }}>
            <p>示例指令：</p>
            <p style={{ color: '#00d4ff' }}>"如果光伏组件数量增加到 20000，碳交易价格提高到 150 元/tCO2"</p>
            <p style={{ color: '#00d4ff' }}>"限制 19-21 时段电网购电不超过 3000kW"</p>
            <p style={{ color: '#00d4ff' }}>"分析光伏组件数量从 5000 到 30000 时成本和碳排放的变化趋势"</p>
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
            <span>Pareto 前沿 — {paretoLabel ?? '参数扫描'}</span>
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
            <p style={{ marginTop: 8, color: '#5a7a9a', fontSize: 11 }}>
              说明：当前优化模型仅考虑运行成本（购电、碳交易等），未包含光伏装机成本。若某参数增大后成本与碳排同步下降，可能表示该参数在运行层面有正向收益；实际决策需结合装机成本等约束综合评估。
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
          <span>Agent 工作区 — {scenarioLabel ?? 'What-If 推演'}</span>
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
                const b = baseSummary[sk]
                const s = scenSummary?.[sk]
                if (!b || !s) return null
                return (
                  <tr key={sk}>
                    <td style={tdStyle}>{LABELS[sk]}</td>
                    <td style={tdNumStyle}>{b.cost.toFixed(0)}</td>
                    <td style={tdNumStyle}>{s.cost.toFixed(0)}</td>
                    <td style={{ ...tdNumStyle, color: s.cost <= b.cost ? '#69f0ae' : '#ff7043' }}>
                      {pct(s.cost, b.cost)}
                    </td>
                    <td style={tdNumStyle}>{b.carbon.toFixed(2)}</td>
                    <td style={tdNumStyle}>{s.carbon.toFixed(2)}</td>
                    <td style={{ ...tdNumStyle, color: s.carbon <= b.carbon ? '#69f0ae' : '#ff7043' }}>
                      {pct(s.carbon, b.carbon)}
                    </td>
                    <td style={tdNumStyle}>{b.combined.toFixed(2)}</td>
                    <td style={tdNumStyle}>{s.combined.toFixed(2)}</td>
                    <td style={{ ...tdNumStyle, color: s.combined <= b.combined ? '#69f0ae' : '#ff7043' }}>
                      {pct(s.combined, b.combined)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 基准 vs 推演 动态图表 */}
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
          <p><b style={{ color: '#4e9eff' }}>基准</b>：系统默认参数下的优化结果（n_PV=10000、G_scale=1.5 等），所有情景对比共用同一基准。</p>
          <p style={{ marginTop: 8 }}>当前推演场景：<b style={{ color: '#00d4ff' }}>{scenarioLabel}</b></p>
          <p style={{ marginTop: 8 }}>
            表格中绿色数值表示推演结果优于基准，红色表示劣于基准。
            您可以在右侧 Agent 中继续修改参数进行新一轮推演。
          </p>
        </div>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 10px', textAlign: 'right', color: '#8ba9cc',
  borderBottom: '1px solid #1e3256', fontWeight: 600, fontSize: 11,
}
const tdStyle: React.CSSProperties = {
  padding: '8px 10px', color: '#8ba9cc', borderBottom: '1px solid #111b2e',
}
const tdNumStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'right', color: '#e8f4ff',
  borderBottom: '1px solid #111b2e', fontVariantNumeric: 'tabular-nums',
}
