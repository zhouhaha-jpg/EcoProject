import { useStrategy } from '@/context/StrategyContext'
import PanelBox from '@/components/ui/PanelBox'
import DigitalNumber from '@/components/ui/DigitalNumber'
import PowerBalanceChart from '@/components/charts/PowerBalanceChart'
import CarbonTrendChart from '@/components/charts/CarbonTrendChart'
import WaterfallChart from '@/components/charts/WaterfallChart'

export default function Energy() {
  const { activeStrategy, dataset, strategyMeta } = useStrategy()
  const meta = strategyMeta[activeStrategy]

  const total = (key: 'P_PV' | 'P_G' | 'P_GM' | 'P_CA') => dataset[key][activeStrategy].reduce((a: number, b: number) => a + b, 0)

  return (
    <div className="h-full grid grid-cols-12 gap-3" style={{ gridTemplateRows: '72px 1fr 1fr' }}>
      {/* METRICS */}
      <PanelBox className="col-span-3">
        <div className="p-4"><DigitalNumber label="光伏总出力" value={total('P_PV').toFixed(0)} unit="kWh" color="#c6f135" size="md" /></div>
      </PanelBox>
      <PanelBox className="col-span-3">
        <div className="p-4"><DigitalNumber label="电网购电量" value={total('P_G').toFixed(0)} unit="kWh" color="#ce93d8" size="md" /></div>
      </PanelBox>
      <PanelBox className="col-span-3">
        <div className="p-4"><DigitalNumber label="燃气轮机发电" value={total('P_GM').toFixed(0)} unit="kWh" color="#ffd740" size="md" /></div>
      </PanelBox>
      <PanelBox className="col-span-3">
        <div className="p-4"><DigitalNumber label="氯碱耗电" value={total('P_CA').toFixed(0)} unit="kWh" color="#4e9eff" size="md" /></div>
      </PanelBox>

      {/* POWER TREND */}
      <PanelBox title="电力调度时序 · 各方案P_CA对比" className="col-span-8 row-span-1">
        <PowerBalanceChart />
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
