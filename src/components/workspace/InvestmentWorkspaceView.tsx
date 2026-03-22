import type { CSSProperties } from 'react'
import type { InvestmentRun } from '@/types'
import InvestmentCashflowChart from '@/components/charts/InvestmentCashflowChart'
import InvestmentBenefitChart from '@/components/charts/InvestmentBenefitChart'

export default function InvestmentWorkspaceView({ run }: { run: InvestmentRun }) {
  const plan = run.payload

  return (
    <div className="h-full min-h-0 overflow-auto" style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 12 }}>
      <div className="panel">
        <div className="panel-title-bar flex items-center justify-between">
          <span>EcoClaw · 投资建设规划</span>
          <span style={{ color: '#5a7a9a', fontSize: 10 }}>{run.createdAt}</span>
        </div>
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          <MetricCard label="组件扩容" value={`${plan.summary.currentModules} → ${plan.summary.targetModules}`} accent="#00d4ff" />
          <MetricCard label="新增投资额" value={`${Math.round(plan.summary.additionalCapex / 10000)} 万元`} accent="#ffd740" />
          <MetricCard label="预计回本期" value={plan.summary.paybackYears == null ? '超过寿命期' : `${plan.summary.paybackYears} 年`} accent="#69f0ae" />
          <MetricCard label="首年综合收益" value={`${Math.round((plan.summary.annualSavings + plan.summary.annualCarbonRevenue) / 10000)} 万元`} accent="#ffb347" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 12 }}>
        <div className="panel" style={{ minHeight: 320 }}>
          <div className="panel-title-bar">逐年累计现金流</div>
          <div style={{ height: 280, padding: 12 }}>
            <InvestmentCashflowChart plan={plan} />
          </div>
        </div>
        <div className="panel" style={{ minHeight: 320 }}>
          <div className="panel-title-bar">扩容前后对比</div>
          <div style={{ height: 280, padding: 12 }}>
            <InvestmentBenefitChart plan={plan} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 12 }}>
        <div className="panel">
          <div className="panel-title-bar">EcoClaw 投资报告</div>
          <div style={{ padding: 16, color: '#8ba9cc', fontSize: 13, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
            {plan.report}
          </div>
        </div>
        <div className="panel">
          <div className="panel-title-bar">默认测算假设</div>
          <div style={{ padding: 16 }}>
            <table className="w-full border-collapse" style={{ fontSize: 12 }}>
              <tbody>
                <tr><td style={cellLabel}>组件单价</td><td style={cellValue}>{plan.assumptions.capexPerModule} 元/组</td></tr>
                <tr><td style={cellLabel}>运维比例</td><td style={cellValue}>{(plan.assumptions.opexRate * 100).toFixed(1)}%</td></tr>
                <tr><td style={cellLabel}>年衰减</td><td style={cellValue}>{(plan.assumptions.annualDegradation * 100).toFixed(1)}%</td></tr>
                <tr><td style={cellLabel}>寿命</td><td style={cellValue}>{plan.assumptions.lifespanYears} 年</td></tr>
                <tr><td style={cellLabel}>碳价</td><td style={cellValue}>{plan.assumptions.carbonPrice} 元/tCO2</td></tr>
                <tr><td style={cellLabel}>当前策略</td><td style={cellValue}>{String(plan.summary.activeStrategy).toUpperCase()}</td></tr>
                <tr><td style={cellLabel}>测算日期</td><td style={cellValue}>{plan.summary.viewDate}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="panel" style={{ padding: 12 }}>
      <div style={{ color: '#5a7a9a', fontSize: 10 }}>{label}</div>
      <div style={{ color: accent, fontFamily: "'Rajdhani', sans-serif", fontSize: 22, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </div>
  )
}

const cellLabel: CSSProperties = {
  color: '#8ba9cc',
  padding: '8px 10px',
  borderBottom: '1px solid #111b2e',
}

const cellValue: CSSProperties = {
  color: '#e8f4ff',
  padding: '8px 10px',
  textAlign: 'right',
  borderBottom: '1px solid #111b2e',
}
