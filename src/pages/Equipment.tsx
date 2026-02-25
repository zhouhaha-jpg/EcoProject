import { useStrategy } from '@/context/StrategyContext'
import PanelBox from '@/components/ui/PanelBox'
import DigitalNumber from '@/components/ui/DigitalNumber'
import StatusBadge from '@/components/ui/StatusBadge'
import PowerBalanceChart from '@/components/charts/PowerBalanceChart'

type EquipSpec = {
  name: string
  type: string
  rated: string
  status: 'success' | 'warning' | 'info' | 'idle'
  statusLabel: string
  color: string
}

const EQUIPMENT: EquipSpec[] = [
  { name: '氯碱电解槽',  type: '用电负荷',   rated: '9020 kW',  status: 'success',           statusLabel: '满功率运行', color: '#00F3FF' },
  { name: 'PEM电解槽',   type: '制氢装置',   rated: '8487 kW',  status: 'info',              statusLabel: '优化调度',   color: '#29D4FF' },
  { name: '光伏阵列',    type: '可再生能源', rated: '6000 kW',  status: 'success',           statusLabel: '正常发电',   color: '#C6F135' },
  { name: '燃气轮机',    type: '热电联供',   rated: '512.5 kW', status: 'idle',              statusLabel: '待机',       color: '#FFD740' },
  { name: '电网并网点',  type: '供电来源',   rated: '无限制',   status: 'success',           statusLabel: '正常并网',   color: '#CE93D8' },
  { name: '储能电池',    type: '储能系统',   rated: '6000 kWh', status: 'info',              statusLabel: 'es策略激活', color: '#FFD740' },
]

export default function Equipment() {
  const { activeStrategy, dataset, strategyMeta } = useStrategy()
  const meta = strategyMeta[activeStrategy]

  const maxPCA  = Math.max(...dataset.P_CA[activeStrategy])
  const maxPPEM = Math.max(...dataset.P_PEM[activeStrategy])
  const maxPPV  = Math.max(...dataset.P_PV[activeStrategy])

  return (
    <div className="h-full min-h-0 grid grid-cols-12 gap-3" style={{ gridTemplateRows: '72px minmax(0, 1fr) minmax(0, 1fr)' }}>
      {/* Equipment cards */}
      {EQUIPMENT.slice(0,4).map(eq => (
        <PanelBox key={eq.name} className="col-span-3" topColor={eq.color}>
          <div className="space-y-2">
            <div className="font-display text-sm text-text-primary tracking-wider">{eq.name}</div>
            <div className="text-xs text-text-muted font-body">{eq.type} · {eq.rated}</div>
            <StatusBadge variant={eq.status} label={eq.statusLabel} />
          </div>
        </PanelBox>
      ))}

      {/* Main power chart */}
      <PanelBox title="关键设备出力曲线" className="col-span-8 row-span-1">
        <PowerBalanceChart />
      </PanelBox>

      {/* Peak stats */}
      <PanelBox title="峰值统计" className="col-span-4 row-span-1">
        <div className="space-y-4">
          <DigitalNumber label="氯碱峰值功率" value={maxPCA.toFixed(0)}  unit="kW" color="#00F3FF" size="md" />
          <DigitalNumber label="PEM峰值功率"  value={maxPPEM.toFixed(0)} unit="kW" color="#FF7043" size="md" />
          <DigitalNumber label="PV峰值出力"   value={maxPPV.toFixed(0)}  unit="kW" color="#C6F135" size="md" />
        </div>
      </PanelBox>

      {/* Bottom panels */}
      {EQUIPMENT.slice(4).map(eq => (
        <PanelBox key={eq.name} className="col-span-3" topColor={eq.color}>
          <div className="space-y-2">
            <div className="font-display text-sm text-text-primary tracking-wider">{eq.name}</div>
            <div className="text-xs text-text-muted font-body">{eq.type} · {eq.rated}</div>
            <StatusBadge variant={eq.status} label={eq.statusLabel} />
          </div>
        </PanelBox>
      ))}
      <PanelBox title="实时功率监控" className="col-span-6 row-span-1">
        <PowerBalanceChart />
      </PanelBox>
    </div>
  )
}
