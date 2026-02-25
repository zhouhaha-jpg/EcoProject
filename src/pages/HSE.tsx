import { useStrategy } from '@/context/StrategyContext'
import PanelBox from '@/components/ui/PanelBox'
import DigitalNumber from '@/components/ui/DigitalNumber'
import StatusBadge from '@/components/ui/StatusBadge'
import CarbonTrendChart from '@/components/charts/CarbonTrendChart'
import WaterfallChart from '@/components/charts/WaterfallChart'
import SystemLog from '@/components/ui/SystemLog'

export default function HSE() {
  const { activeStrategy, dataset, strategyMeta } = useStrategy()
  const d = dataset[activeStrategy]
  const meta = strategyMeta[activeStrategy]

  const totalCarbon = d.summary.carbon
  const quota = 310 // tonCO2 daily quota (rough)
  const remaining = quota - totalCarbon
  const pct = Math.max(0, Math.min(100, (remaining / quota) * 100))

  const ef_g = d.ef_g as number[]
  const maxEf = Math.max(...ef_g)
  const minEf = Math.min(...ef_g)

  return (
    <div className="h-full grid grid-cols-12 grid-rows-[auto_1fr_1fr] gap-3">
      {/* KPIs */}
      <PanelBox className="col-span-3" topColor={meta.color}>
        <DigitalNumber label="日碳排放量" value={totalCarbon.toFixed(2)} unit="tCO₂" color={meta.color} size="lg" />
      </PanelBox>
      <PanelBox className="col-span-3" topColor="#C6F135">
        <DigitalNumber label="碳配额剩余" value={remaining.toFixed(2)} unit="tCO₂" color="#C6F135" size="lg" />
      </PanelBox>
      <PanelBox className="col-span-3" topColor="#FFD740">
        <DigitalNumber label="配额使用率" value={pct.toFixed(1)} unit="%" color="#FFD740" size="lg" />
      </PanelBox>
      <PanelBox className="col-span-3" topColor="#FF7043">
        <div className="space-y-2">
          <DigitalNumber label="碳因子峰值" value={maxEf.toFixed(6)} unit="tCO₂/kWh" color="#FF7043" size="sm" />
          <DigitalNumber label="碳因子谷值" value={minEf.toFixed(6)} unit="tCO₂/kWh" color="#29D4FF" size="sm" />
        </div>
      </PanelBox>

      {/* Carbon trend */}
      <PanelBox title="逐时CO₂排放" className="col-span-8 row-span-1" topColor={meta.color}>
        <CarbonTrendChart />
      </PanelBox>

      {/* Safety status */}
      <PanelBox title="安全状态监测" className="col-span-4 row-span-1">
        <div className="space-y-3">
          <StatusBadge variant="success" label="H₂泄漏检测 正常" />
          <StatusBadge variant="success" label="电气安全 合规" />
          <StatusBadge variant="success" label="消防联动 待命" />
          <StatusBadge variant="info"    label="碳排监测 实时上报" />
          <StatusBadge variant="warning" label="配额余量 < 15%" />
          <div className="mt-4">
            <div className="text-xs text-text-muted mb-1 font-body">碳配额使用进度</div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${100 - pct}%`, background: `linear-gradient(90deg, ${meta.color}, #FF7043)` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-text-muted mt-1 font-mono">
              <span>0</span><span>{quota} tCO₂</span>
            </div>
          </div>
        </div>
      </PanelBox>

      {/* Bottom */}
      <PanelBox title="各策略碳排对比" className="col-span-6 row-span-1">
        <WaterfallChart metric="carbon" />
      </PanelBox>
      <PanelBox title="系统日志" className="col-span-6 row-span-1">
        <SystemLog />
      </PanelBox>
    </div>
  )
}
