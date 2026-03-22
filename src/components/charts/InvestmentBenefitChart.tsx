import type { CSSProperties } from 'react'
import type { InvestmentPlanResult } from '@/types'

const METRICS = [
  {
    key: 'annualCost' as const,
    label: '年成本',
    unit: '元/年',
    accent: '#4e9eff',
    beforeLabel: '扩容前',
    afterLabel: '扩容后',
    formatter: (value: number) => formatCurrency(value),
    betterDirection: 'down' as const,
  },
  {
    key: 'annualCarbon' as const,
    label: '年碳排',
    unit: 'tCO2/年',
    accent: '#69f0ae',
    beforeLabel: '扩容前',
    afterLabel: '扩容后',
    formatter: (value: number) => `${formatCompact(value, 1)} t`,
    betterDirection: 'down' as const,
  },
  {
    key: 'dailyGeneration' as const,
    label: '日发电量',
    unit: 'kWh/日',
    accent: '#ffd740',
    beforeLabel: '扩容前',
    afterLabel: '扩容后',
    formatter: (value: number) => `${formatCompact(value, 0)} kWh`,
    betterDirection: 'up' as const,
  },
]

export default function InvestmentBenefitChart({ plan }: { plan: InvestmentPlanResult }) {
  return (
    <div className="grid h-full w-full gap-3 md:grid-cols-3">
      {METRICS.map((metric) => {
        const before = Number(plan.beforeAfter[metric.key].before) || 0
        const after = Number(plan.beforeAfter[metric.key].after) || 0
        const maxValue = Math.max(before, after, 1)
        const delta = after - before
        const ratio = before === 0 ? 0 : (delta / before) * 100
        const positiveChange = metric.betterDirection === 'up' ? delta >= 0 : delta <= 0

        return (
          <section
            key={metric.key}
            className="rounded border"
            style={{
              borderColor: `${metric.accent}33`,
              background: `linear-gradient(180deg, ${metric.accent}12 0%, rgba(11,18,31,0.96) 100%)`,
              padding: 14,
              display: 'grid',
              gap: 14,
            }}
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <div style={{ color: '#e8f4ff', fontSize: 13, fontWeight: 700 }}>{metric.label}</div>
                <div style={{ color: '#5a7a9a', fontSize: 10, marginTop: 4 }}>{metric.unit}</div>
              </div>
              <span
                style={{
                  color: positiveChange ? '#69f0ae' : '#ffb199',
                  border: `1px solid ${positiveChange ? '#69f0ae55' : '#ff704355'}`,
                  background: positiveChange ? 'rgba(105,240,174,0.12)' : 'rgba(255,112,67,0.12)',
                  borderRadius: 999,
                  padding: '3px 8px',
                  fontSize: 10,
                  whiteSpace: 'nowrap',
                }}
              >
                {ratio === 0 ? '基本持平' : `${positiveChange ? '改善' : '变差'} ${Math.abs(ratio).toFixed(1)}%`}
              </span>
            </header>

            <div style={{ display: 'grid', gap: 12 }}>
              <MetricBar
                label={metric.beforeLabel}
                value={before}
                formatted={metric.formatter(before)}
                width={Math.max((before / maxValue) * 100, before > 0 ? 10 : 0)}
                accent={metric.accent}
                variant="before"
              />
              <MetricBar
                label={metric.afterLabel}
                value={after}
                formatted={metric.formatter(after)}
                width={Math.max((after / maxValue) * 100, after > 0 ? 10 : 0)}
                accent={metric.accent}
                variant="after"
              />
            </div>

            <footer
              className="rounded border"
              style={{
                borderColor: '#1e3256',
                background: 'rgba(7,12,20,0.55)',
                padding: '10px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ color: '#5a7a9a', fontSize: 10 }}>绝对变化</span>
              <span style={{ color: metric.accent, fontFamily: "'Rajdhani', sans-serif", fontSize: 18, fontWeight: 700 }}>
                {delta > 0 ? '+' : ''}
                {metric.key === 'dailyGeneration' ? formatCompact(delta, 0) : formatCompact(delta, 1)}
              </span>
            </footer>
          </section>
        )
      })}
    </div>
  )
}

function MetricBar({
  label,
  value,
  formatted,
  width,
  accent,
  variant,
}: {
  label: string
  value: number
  formatted: string
  width: number
  accent: string
  variant: 'before' | 'after'
}) {
  const barColor = variant === 'before'
    ? {
        start: `${accent}bb`,
        end: `${accent}66`,
      }
    : {
        start: '#9fffe0',
        end: accent,
      }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="flex items-center justify-between gap-4">
        <span style={{ color: '#8ba9cc', fontSize: 11 }}>{label}</span>
        <span style={{ color: '#e8f4ff', fontSize: 12, fontWeight: 600 }}>{formatted}</span>
      </div>
      <div
        className="relative overflow-hidden rounded-full"
        style={{
          height: 14,
          background: 'rgba(11,18,31,0.92)',
          border: '1px solid #1e3256',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.02)',
        }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            minWidth: value > 0 ? 10 : 0,
            background: `linear-gradient(90deg, ${barColor.start} 0%, ${barColor.end} 100%)`,
            boxShadow: `0 0 18px ${accent}55, inset 0 0 16px rgba(255,255,255,0.15)`,
            transition: 'width 300ms ease',
          }}
        />
      </div>
    </div>
  )
}

function formatCurrency(value: number) {
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(2)} 亿元`
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)} 万元`
  return `${Math.round(value).toLocaleString('zh-CN')} 元`
}

function formatCompact(value: number, digits = 1) {
  const abs = Math.abs(value)
  if (abs >= 100000000) return `${(value / 100000000).toFixed(digits)}亿`
  if (abs >= 10000) return `${(value / 10000).toFixed(digits)}万`
  return value.toFixed(digits)
}

export const investmentBenefitChartStyles: Record<string, CSSProperties> = {}
