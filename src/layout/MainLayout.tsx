import { Link, useLocation, Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import StrategySwitcher from '@/components/ui/StrategySwitcher'
import AgentSidebar from '@/components/agent/AgentSidebar'
import DataSourceHealth from '@/components/ui/DataSourceHealth'
import ParkConfigPopover from '@/components/ui/ParkConfigPopover'
import TimeTravelPopover from '@/components/ui/TimeTravelPopover'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { useStrategy } from '@/context/StrategyContext'
import { LayoutDashboard, Zap, Sun, Flame, Battery, Plug, TrendingUp, Database, GitCompare } from 'lucide-react'

const NAV = [
  { to: '/overview', label: '总览', icon: LayoutDashboard },
  { to: '/scenario', label: 'Agent工作区', icon: GitCompare },
  { to: '/economic', label: '经济指标', icon: TrendingUp },
  { to: '/storage', label: '存储模块', icon: Database },
  { to: '/ca', label: '电解槽', icon: Battery },
  { to: '/pv', label: '光伏', icon: Sun },
  { to: '/gm', label: '燃气轮机', icon: Flame },
  { to: '/pem', label: 'PEM', icon: Zap },
  { to: '/g', label: '电网', icon: Plug },
]

export default function MainLayout() {
  const location = useLocation()
  const realtime = useRealtimeData()
  const { updateDataset, datasetMeta } = useStrategy()

  useEffect(() => {
    if (realtime.latestOptDataset && !datasetMeta.isHistorical) {
      updateDataset(realtime.latestOptDataset.data, realtime.latestOptDataset.meta)
    }
  }, [datasetMeta.isHistorical, realtime.latestOptDataset, updateDataset])

  return (
    <div className="scanlines h-screen w-full flex flex-col overflow-hidden" style={{ background: '#070c14' }}>
      <header className="hud-header relative z-10 shrink-0 flex items-center gap-5 px-8 py-4">
        <div className="logo-pulse" />
        <h1 style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 600, letterSpacing: 2, color: '#e8f4ff' }}>
          智慧园区 <span style={{ color: '#00d4ff', fontWeight: 700 }}>节能减排</span> 调度平台
        </h1>
        <div className="ml-auto flex items-center gap-3">
          <DataSourceHealth
            sources={realtime.sources}
            health={realtime.health}
            connected={realtime.connected}
            lastUpdated={realtime.lastUpdated}
            prices={realtime.prices}
            solar={realtime.solar}
            carbon={realtime.carbon}
          />
          <span className="hud-chip" title={`展示日期 ${datasetMeta.viewDate || '本地默认'} | 快照 ${datasetMeta.snapshotAt || '--'}`}>
            {datasetMeta.isHistorical ? 'HISTORY' : 'LIVE'} {datasetMeta.viewDate || 'LOCAL'}
          </span>
          <span className="hud-chip" title="当前图表展示的数据快照时间">
            截止 {datasetMeta.snapshotAt ? datasetMeta.snapshotAt.slice(5, 16) : '--'}
          </span>
          <TimeTravelPopover />
          <ParkConfigPopover />
          <span className="hud-chip">24 H</span>
          <span className="hud-chip">6 STRATEGIES</span>
          <span className="hud-chip live">INTERACTIVE</span>
        </div>
      </header>

      <div className="relative z-10 flex gap-px px-8" style={{ background: '#0d1422', borderBottom: '1px solid #1e3256' }}>
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to
          return (
            <Link
              key={to}
              to={to}
              className={`hud-nav-link ${active ? 'active' : ''}`}
            >
              <Icon size={13} />
              {label}
            </Link>
          )
        })}
        <div className="ml-auto flex items-center">
          <StrategySwitcher />
        </div>
      </div>

      <div className="relative z-[1] flex-1 min-h-0 flex overflow-hidden">
        <main className="flex-1 min-h-0 overflow-hidden p-5">
          <Outlet />
        </main>
        <div className="relative shrink-0 h-full">
          <AgentSidebar realtimeData={realtime} />
        </div>
      </div>
    </div>
  )
}
