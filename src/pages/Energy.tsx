import { useState } from 'react'
import { useStrategy } from '@/context/StrategyContext'
import PanelBox from '@/components/ui/PanelBox'
import DigitalNumber from '@/components/ui/DigitalNumber'
import PowerBalanceChart from '@/components/charts/PowerBalanceChart'
import CarbonTrendChart from '@/components/charts/CarbonTrendChart'
import WaterfallChart from '@/components/charts/WaterfallChart'
import type { StrategyKey } from '@/types'

export default function Energy() {
  const { activeStrategy, dataset, strategyMeta } = useStrategy()
  const d = dataset[activeStrategy]
  const meta = strategyMeta[activeStrategy]
  const [compareMode, setCompareMode] = useState(false)

  const total = (key: string) => (d[key as keyof typeof d] as number[]).reduce((a: number,b: number)=>a+b,0)

  return (
    <div className="h-full grid grid-cols-12 grid-rows-[auto_1fr_1fr] gap-3">
      {/* METRICS */}
      <PanelBox className="col-span-3" topColor={meta.color}>
        <DigitalNumber label="光伏总出力" value={total('P_PV').toFixed(0)} unit="kWh" color="#C6F135" size="md" />
      </PanelBox>
      <PanelBox className="col-span-3" topColor="#CE93D8">
        <DigitalNumber label="电网购电量" value={total('P_G').toFixed(0)} unit="kWh" color="#CE93D8" size="md" />
      </PanelBox>
      <PanelBox className="col-span-3" topColor="#FFD740">
        <DigitalNumber label="燃气轮机发电" value={total('P_GM').toFixed(0)} unit="kWh" color="#FFD740" size="md" />
      </PanelBox>
      <PanelBox className="col-span-3" topColor="#00F3FF">
        <DigitalNumber label="氯碱耗电" value={total('P_CA').toFixed(0)} unit="kWh" color="#00F3FF" size="md" />
      </PanelBox>

      {/* POWER TREND */}
      <PanelBox
        title="电力调度时序"
        className="col-span-8 row-span-1"
        topColor={meta.color}
        footer={
          <button
            onClick={() => setCompareMode(v => !v)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${compareMode ? 'border-neon-cyan text-neon-cyan' : 'border-border-cyber text-text-muted hover:text-text-primary'}`}
          >
            {compareMode ? '◈ 多策略对比' : '◇ 单策略视图'}
          </button>
        }
      >
        <PowerBalanceChart strategies={compareMode ? (['uci','es','pv'] as StrategyKey[]) : undefined} />
      </PanelBox>

      {/* Carbon */}
      <PanelBox title="碳排放时序" className="col-span-4 row-span-1">
        <CarbonTrendChart />
      </PanelBox>

      {/* Waterfall combined */}
      <PanelBox title="综合目标对比" className="col-span-6 row-span-1">
        <WaterfallChart metric="combined" />
      </PanelBox>

      {/* Waterfall cost */}
      <PanelBox title="运营成本对比" className="col-span-6 row-span-1">
        <WaterfallChart metric="cost" />
      </PanelBox>
    </div>
  )
}
