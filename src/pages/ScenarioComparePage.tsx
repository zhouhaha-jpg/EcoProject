/**
 * 方案对比页：展示 What-If 推演结果与基准方案的对比
 */
import { useStrategy } from '@/context/StrategyContext'
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
  const { dataset, scenarioDataset, scenarioLabel, datasetLoading } = useStrategy()

  if (datasetLoading) {
    return <div className="h-full flex items-center justify-center text-text-muted">加载数据中…</div>
  }

  if (!scenarioDataset) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="panel" style={{ padding: 32, maxWidth: 500, textAlign: 'center' }}>
          <div className="panel-title-bar" style={{ textAlign: 'center', marginBottom: 16 }}>方案对比</div>
          <p style={{ color: '#8ba9cc', fontSize: 13, lineHeight: 1.8 }}>
            暂无推演数据。请在右侧 Agent 面板中使用自然语言发起 What-If 推演。
          </p>
          <div style={{ marginTop: 16, color: '#3d6080', fontSize: 12 }}>
            <p>示例指令：</p>
            <p style={{ color: '#00d4ff' }}>"如果光伏组件数量增加到 20000，碳交易价格提高到 150 元/tCO2"</p>
            <p style={{ color: '#00d4ff' }}>"限制 19-21 时段电网购电不超过 3000kW"</p>
          </div>
        </div>
      </div>
    )
  }

  const baseSummary = dataset.summary
  const scenSummary = scenarioDataset.summary as Record<StrategyKey, { cost: number; carbon: number; combined: number }>

  return (
    <div className="h-full min-h-0 overflow-auto" style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 12 }}>
      <div className="panel shrink-0">
        <div className="panel-title-bar flex items-center justify-between">
          <span>方案对比 — {scenarioLabel ?? 'What-If 推演'}</span>
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

      <div className="panel min-h-0 flex flex-col">
        <div className="panel-title-bar">推演说明</div>
        <div style={{ flex: 1, padding: 16, color: '#8ba9cc', fontSize: 13, lineHeight: 1.8 }}>
          <p>当前推演场景：<b style={{ color: '#00d4ff' }}>{scenarioLabel}</b></p>
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
