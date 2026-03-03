/**
 * 经济指标页：成本、碳排放、综合指标 在各策略下的对比
 * 数据来源：dataset.summary
 */
import { useStrategy } from '@/context/StrategyContext'
import EconomicIndicatorChart from '@/components/charts/EconomicIndicatorChart'
import type { StrategyKey } from '@/types'

const STRATEGY_ORDER: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']

const STRATEGY_LABELS: Record<StrategyKey, string> = {
  uci: 'UCI', cicos: 'CICOS', cicar: 'CICAR',
  cicom: 'CICOM', pv: 'PV', es: 'ES',
}

const METRIC_LABELS: Record<string, string> = {
  cost: '成本 (元)',
  carbon: '碳排放 (tCO2)',
  combined: '综合指标',
}

export default function EconomicIndicatorsPage() {
  const { dataset, datasetLoading, datasetError } = useStrategy()
  const summary = dataset?.summary as Record<StrategyKey, { cost: number; carbon: number; combined: number }> | undefined

  if (datasetLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        加载数据中…
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        暂无经济指标数据
      </div>
    )
  }

  return (
    <div
      className="h-full min-h-0 overflow-auto"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gridTemplateRows: 'auto 1fr',
        gap: 16,
        minHeight: 0,
      }}
    >
      {/* 数据表格 */}
      <div className="panel shrink-0">
        <div className="panel-title-bar">
          经济指标汇总
          {datasetError && (
            <span style={{ color: '#ff7043', marginLeft: 8, fontSize: 12 }}>（本地数据）</span>
          )}
        </div>
        <div className="overflow-x-auto" style={{ padding: 16 }}>
          <table
            className="w-full border-collapse"
            style={{
              fontSize: 12,
              fontFamily: "'Share Tech Mono', 'Rajdhani', monospace",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    color: '#3d6080',
                    borderBottom: '1px solid #1e3256',
                    fontWeight: 500,
                  }}
                >
                  指标
                </th>
                {STRATEGY_ORDER.map((sk) => (
                  <th
                    key={sk}
                    style={{
                      padding: '10px 14px',
                      textAlign: 'right',
                      color: '#8ba9cc',
                      borderBottom: '1px solid #1e3256',
                      fontWeight: 600,
                    }}
                  >
                    {STRATEGY_LABELS[sk]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['cost', 'carbon', 'combined'] as const).map((metric) => (
                <tr key={metric}>
                  <td
                    style={{
                      padding: '10px 14px',
                      color: '#8ba9cc',
                      borderBottom: '1px solid #111b2e',
                    }}
                  >
                    {METRIC_LABELS[metric]}
                  </td>
                  {STRATEGY_ORDER.map((sk) => {
                    const val = summary[sk]?.[metric] ?? 0
                    const fmt =
                      metric === 'cost'
                        ? val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : metric === 'carbon'
                          ? val.toFixed(2)
                          : val.toFixed(2)
                    return (
                      <td
                        key={sk}
                        style={{
                          padding: '10px 14px',
                          textAlign: 'right',
                          color: '#e8f4ff',
                          borderBottom: '1px solid #111b2e',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {fmt}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 三组柱状图 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          minHeight: 0,
        }}
      >
        {(['cost', 'carbon', 'combined'] as const).map((m) => (
          <div key={m} className="panel min-h-0 flex flex-col">
            <div className="panel-title-bar" style={{ fontSize: 12 }}>
              {METRIC_LABELS[m]}
            </div>
            <div style={{ flex: 1, minHeight: 180 }}>
              <EconomicIndicatorChart metric={m} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
