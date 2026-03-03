/**
 * 总览页：同时展示 5 个前缀的功率时序图 + 经济指标小图
 * 布局：上排 3 图（电解槽/光伏/燃气轮机），中排 2 图（质子膜燃料电池/电网），下排经济指标
 */
import { Link } from 'react-router-dom'
import { useStrategy } from '@/context/StrategyContext'
import PrefixPowerChart from '@/components/charts/PrefixPowerChart'
import EconomicIndicatorChart from '@/components/charts/EconomicIndicatorChart'
import type { PrefixKey } from '@/types'

const PREFIX_ORDER: PrefixKey[] = ['ca', 'pv', 'gm', 'pem', 'g']

const PREFIX_LABELS: Record<PrefixKey, string> = {
  ca: '电解槽',
  pv: '光伏',
  gm: '燃气轮机',
  pem: '质子膜燃料电池',
  g: '电网',
}

export default function OverviewPage() {
  const { datasetLoading, datasetError } = useStrategy()

  if (datasetLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        加载数据中…
      </div>
    )
  }

  return (
    <div
      className="h-full min-h-0 overflow-hidden"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gridTemplateRows: '1fr 1fr 0.55fr',
        gap: 12,
        minHeight: 0,
      }}
    >
      {PREFIX_ORDER.map((prefix) => {
        const gridCol =
          prefix === 'ca' ? '1 / 3' :
          prefix === 'pv' ? '3 / 5' :
          prefix === 'gm' ? '5 / 7' :
          prefix === 'pem' ? '1 / 4' :
          '4 / 7'
        return (
        <div
          key={prefix}
          className="panel min-h-0 flex flex-col"
          style={{ gridColumn: gridCol }}
        >
          <div className="panel-title-bar">
            {PREFIX_LABELS[prefix]}功率时序
            {datasetError && prefix === 'ca' && (
              <span style={{ color: '#ff7043', marginLeft: 8 }}>（本地数据）</span>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <PrefixPowerChart prefix={prefix} />
          </div>
        </div>
      )})}
      {/* 经济指标小图 */}
      <div
        className="panel min-h-0 flex flex-col"
        style={{ gridColumn: '1 / 7' }}
      >
        <div className="panel-title-bar flex items-center justify-between">
          <span>经济指标（综合）</span>
          <Link
            to="/economic"
            className="text-xs hover:text-[#00d4ff] transition-colors"
            style={{ color: '#3d6080' }}
          >
            查看详情 →
          </Link>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <EconomicIndicatorChart compact metric="combined" />
        </div>
      </div>
    </div>
  )
}
