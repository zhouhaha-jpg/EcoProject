import type { CSSProperties } from 'react'
import type { InvestmentRun } from '@/types'
import InvestmentCashflowChart from '@/components/charts/InvestmentCashflowChart'
import InvestmentBenefitChart from '@/components/charts/InvestmentBenefitChart'

export default function InvestmentWorkspaceView({ run }: { run: InvestmentRun }) {
  const plan = run.payload
  const firstYearBenefit = plan.summary.annualSavings + plan.summary.annualCarbonRevenue

  return (
    <div
      className="h-full min-h-0 overflow-auto"
      style={{ display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', gap: 12 }}
    >
      <section className="panel">
        <div className="panel-title-bar flex items-center justify-between">
          <span>EcoClaw · 投资建设规划</span>
          <span style={{ color: '#5a7a9a', fontSize: 10 }}>{run.createdAt}</span>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 14 }}>
          <div
            className="rounded border"
            style={{
              borderColor: '#1e3256',
              background: 'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(11,18,31,0.95) 68%)',
              padding: '14px 16px',
            }}
          >
            <div style={{ color: '#00d4ff', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' }}>
              PV ROI Planner
            </div>
            <div style={{ color: '#e8f4ff', fontSize: 18, fontWeight: 700, marginTop: 6 }}>
              光伏扩容投资建设规划
            </div>
            <div style={{ color: '#8ba9cc', fontSize: 12, marginTop: 8 }}>
              面向评审展示的光伏扩容回本测算，聚焦新增投资、首年收益、回本期和现金流走势。
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
            <MetricCard label="组件扩容" value={`${plan.summary.currentModules} → ${plan.summary.targetModules}`} accent="#00d4ff" />
            <MetricCard label="新增投资额" value={`${Math.round(plan.summary.additionalCapex / 10000)} 万元`} accent="#ffd740" />
            <MetricCard label="预计回本期" value={plan.summary.paybackYears == null ? '超过寿命期' : `${plan.summary.paybackYears} 年`} accent="#69f0ae" />
            <MetricCard label="首年综合收益" value={`${Math.round(firstYearBenefit / 10000)} 万元`} accent="#ffb347" />
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 12 }}>
        <section className="panel" style={{ minHeight: 320 }}>
          <div className="panel-title-bar">逐年累计现金流</div>
          <div style={{ height: 280, padding: 12 }}>
            <InvestmentCashflowChart plan={plan} />
          </div>
        </section>

        <section className="panel" style={{ minHeight: 320 }}>
          <div className="panel-title-bar">扩容前后对比</div>
          <div style={{ minHeight: 280, padding: 12 }}>
            <InvestmentBenefitChart plan={plan} />
          </div>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 12, minHeight: 0 }}>
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="panel-title-bar">EcoClaw 投资报告</div>
          <div
            style={{
              padding: 16,
              color: '#8ba9cc',
              fontSize: 13,
              lineHeight: 1.9,
              whiteSpace: 'pre-wrap',
              overflowY: 'auto',
              maxHeight: 520,
            }}
          >
            {plan.report}
          </div>
        </section>

        <section className="panel">
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
        </section>
      </div>
    </div>
  )
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="panel" style={{ padding: 12 }}>
      <div style={{ color: '#5a7a9a', fontSize: 10 }}>{label}</div>
      <div style={{ color: accent, fontFamily: "'Rajdhani', sans-serif", fontSize: 22, fontWeight: 700, marginTop: 6 }}>
        {value}
      </div>
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
