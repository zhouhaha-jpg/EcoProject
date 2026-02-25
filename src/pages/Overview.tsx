import { useStrategy } from '@/context/StrategyContext'
import PanelBox from '@/components/ui/PanelBox'
import DigitalNumber from '@/components/ui/DigitalNumber'
import StatusBadge from '@/components/ui/StatusBadge'
import SystemLog from '@/components/ui/SystemLog'
import StrategyRadarChart from '@/components/charts/StrategyRadarChart'
import WaterfallChart from '@/components/charts/WaterfallChart'
import PowerBalanceChart from '@/components/charts/PowerBalanceChart'

export default function Overview() {
  const { activeStrategy, dataset, strategyMeta } = useStrategy()
  const d = dataset[activeStrategy]
  const meta = strategyMeta[activeStrategy]
  const summary = d.summary

  const kpis = [
    { label: '运营成本', value: (summary.cost / 10000).toFixed(2), unit: '万元', color: meta.color, decimals: 2 },
    { label: '碳排放量', value: summary.carbon.toFixed(2),          unit: 'tCO₂', color: '#29D4FF' },
    { label: '综合目标', value: summary.combined.toFixed(3),         unit: '',     color: '#C6F135' },
    { label: 'H₂总产量', value: ((d.H_PEM as number[]).reduce((a: number,b: number)=>a+b,0)+(d.H_CA as number[]).reduce((a: number,b: number)=>a+b,0)).toFixed(0),
      unit: 'kg', color: '#CE93D8' },
  ]

  const totalPV = ((d.P_PV as number[]).reduce((a: number,b: number)=>a+b,0)).toFixed(0)
  const totalPG  = ((d.P_G  as number[]).reduce((a: number,b: number)=>a+b,0)).toFixed(0)

  return (
    <div className="h-full grid grid-cols-12 grid-rows-[auto_1fr_1fr] gap-3">
      {/* KPI ROW */}
      {kpis.map((k) => (
        <PanelBox key={k.label} className="col-span-3 row-span-1" topColor={k.color}>
          <DigitalNumber label={k.label} value={k.value} unit={k.unit} color={k.color} size="lg" />
        </PanelBox>
      ))}

      {/* ROW 2 */}
      {/* Power balance chart — 7 cols */}
      <PanelBox title="电力平衡 · 24h趋势" className="col-span-7 row-span-1" topColor={meta.color}>
        <PowerBalanceChart />
      </PanelBox>

      {/* Radar — 2 cols */}
      <PanelBox title="策略综合评分" className="col-span-3 row-span-1">
        <StrategyRadarChart />
      </PanelBox>

      {/* System info — 2 cols */}
      <PanelBox title="系统状态" className="col-span-2 row-span-1">
        <div className="space-y-3">
          <StatusBadge variant="ok" label="系统运行正常" />
          <DigitalNumber label="光伏总发电" value={totalPV} unit="kWh" color="#C6F135" size="sm" />
          <DigitalNumber label="电网购电" value={totalPG} unit="kWh" color="#CE93D8" size="sm" />
          <div className="pt-1">
            <StatusBadge variant="info" label={`策略: ${meta.label}`} />
          </div>
        </div>
      </PanelBox>

      {/* ROW 3 */}
      {/* Waterfall cost — 4 cols */}
      <PanelBox title="策略成本对比" className="col-span-4 row-span-1">
        <WaterfallChart metric="cost" />
      </PanelBox>

      {/* Waterfall carbon — 4 cols */}
      <PanelBox title="策略碳排对比" className="col-span-4 row-span-1">
        <WaterfallChart metric="carbon" />
      </PanelBox>

      {/* System log — 4 cols */}
      <PanelBox title="系统日志" className="col-span-4 row-span-1">
        <SystemLog />
      </PanelBox>
    </div>
  )
}
