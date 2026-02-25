import { useStrategy } from '@/context/StrategyContext'
import PanelBox from '@/components/ui/PanelBox'
import DigitalNumber from '@/components/ui/DigitalNumber'
import HydrogenChart from '@/components/charts/HydrogenChart'
import WaterfallChart from '@/components/charts/WaterfallChart'
import CarbonTrendChart from '@/components/charts/CarbonTrendChart'

export default function Production() {
  const { activeStrategy, dataset, strategyMeta } = useStrategy()
  const meta = strategyMeta[activeStrategy]
  const totalH_CA  = dataset.H_CA[activeStrategy].reduce((a: number,b: number)=>a+b,0)
  const totalH_PEM = dataset.H_PEM[activeStrategy].reduce((a: number,b: number)=>a+b,0)
  const totalH2    = totalH_CA + totalH_PEM

  return (
    <div className="h-full grid grid-cols-12 grid-rows-[auto_1fr_1fr] gap-3">
      {/* KPIs */}
      <PanelBox className="col-span-3" topColor={meta.color}>
        <DigitalNumber label="氢气总产量" value={totalH2.toFixed(1)} unit="kg" color={meta.color} size="lg" />
      </PanelBox>
      <PanelBox className="col-span-3" topColor="#00F3FF">
        <DigitalNumber label="氯碱制氢" value={totalH_CA.toFixed(1)} unit="kg" color="#00F3FF" size="lg" />
      </PanelBox>
      <PanelBox className="col-span-3" topColor="#FF7043">
        <DigitalNumber label="PEM制氢" value={totalH_PEM.toFixed(1)} unit="kg" color="#FF7043" size="lg" />
      </PanelBox>
      <PanelBox className="col-span-3" topColor="#CE93D8">
        <DigitalNumber label="PEM电解功耗" value={dataset.P_PEM[activeStrategy].reduce((a: number,b: number)=>a+b,0).toFixed(0)} unit="kWh" color="#CE93D8" size="lg" />
      </PanelBox>

      {/* H2 stacked chart */}
      <PanelBox title="氢气产量与储能时序" className="col-span-8 row-span-1" topColor={meta.color}>
        <HydrogenChart />
      </PanelBox>
      <PanelBox title="碳排放趋势" className="col-span-4 row-span-1">
        <CarbonTrendChart />
      </PanelBox>

      {/* Bottom */}
      <PanelBox title="综合目标对比" className="col-span-6 row-span-1">
        <WaterfallChart metric="combined" />
      </PanelBox>
      <PanelBox title="碳排对比" className="col-span-6 row-span-1">
        <WaterfallChart metric="carbon" />
      </PanelBox>
    </div>
  )
}
