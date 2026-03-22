import { Link, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Battery,
  Database,
  FileText,
  Flame,
  GitCompare,
  LayoutDashboard,
  Orbit,
  Plug,
  Sun,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import AgentSidebar from '@/components/agent/AgentSidebar'
import DataSourceHealth from '@/components/ui/DataSourceHealth'
import ParkConfigPopover from '@/components/ui/ParkConfigPopover'
import StrategySwitcher from '@/components/ui/StrategySwitcher'
import SystemLog from '@/components/ui/SystemLog'
import TimeTravelPopover from '@/components/ui/TimeTravelPopover'
import { useStrategy } from '@/context/StrategyContext'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { restoreEmergencyStateApi } from '@/lib/api'

const NAV = [
  { to: '/overview', label: '总览', icon: LayoutDashboard },
  { to: '/scenario', label: 'EcoClaw', icon: GitCompare },
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
  const {
    updateDataset,
    datasetMeta,
    emergencyActiveRun,
    setEmergencyPreviewRun,
    restoreNormalDatasetState,
  } = useStrategy()
  const [logOpen, setLogOpen] = useState(false)
  const logButtonRef = useRef<HTMLButtonElement | null>(null)
  const logPanelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const latestType = realtime.latestOptDataset?.meta?.datasetType
    if (realtime.latestOptDataset && latestType !== 'emergency' && !datasetMeta.isHistorical && !datasetMeta.emergencyActive) {
      updateDataset(realtime.latestOptDataset.data, realtime.latestOptDataset.meta)
    }
  }, [datasetMeta.emergencyActive, datasetMeta.isHistorical, realtime.latestOptDataset, updateDataset])

  useEffect(() => {
    if (!logOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (logButtonRef.current?.contains(target)) return
      if (logPanelRef.current?.contains(target)) return
      setLogOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLogOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [logOpen])

  const latestLog = realtime.serverLogs[0]
  const activeLogCount = useMemo(
    () => realtime.serverLogs.filter((log) => log.status === 'start' || log.status === 'progress').length,
    [realtime.serverLogs],
  )

  const logPanel = logOpen
    ? createPortal(
        <div
          ref={logPanelRef}
          style={{
            position: 'fixed',
            zIndex: 99999,
            top: (logButtonRef.current?.getBoundingClientRect().bottom ?? 56) + 12,
            right: Math.max(16, window.innerWidth - (logButtonRef.current?.getBoundingClientRect().right ?? window.innerWidth)),
            width: Math.min(560, window.innerWidth - 32),
            background: '#111b2a',
            border: '1px solid #1e3256',
            borderRadius: 8,
            boxShadow: '0 18px 56px rgba(0,0,0,0.72), 0 0 28px rgba(0,212,255,0.12)',
            overflow: 'hidden',
          }}
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: '#1e3256' }}>
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="text-xs font-semibold"
                style={{ color: '#e8f4ff', fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}
              >
                后端日志
              </span>
              <span
                className="rounded px-1.5 py-0.5 text-[10px]"
                style={{
                  background: 'rgba(0,212,255,0.1)',
                  color: '#00d4ff',
                  border: '1px solid #00d4ff40',
                }}
              >
                {latestLog?.time || '--:--:--'}
              </span>
            </div>
            <button onClick={() => setLogOpen(false)} className="text-[#3d6080] transition-colors hover:text-[#8ba9cc]">
              <X size={14} />
            </button>
          </div>

          <div className="border-b px-4 py-2 text-[10px]" style={{ borderColor: '#1e3256', color: '#5a7a9a' }}>
            {latestLog?.message || '等待后端日志流'}
          </div>

          <div className="overflow-y-auto px-3 py-3" style={{ maxHeight: 'min(62vh, 640px)' }}>
            <SystemLog logs={realtime.serverLogs} compact maxItems={40} />
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <div className="scanlines flex h-screen w-full flex-col overflow-hidden" style={{ background: '#070c14' }}>
      <header className="hud-header relative z-[260] flex shrink-0 items-center gap-5 px-8 py-4">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#00d4ff55] bg-[#00d4ff12] shadow-[0_0_22px_rgba(0,212,255,0.18)]"
          style={{ color: '#7df9ff' }}
        >
          <Orbit size={18} strokeWidth={1.8} />
        </div>
        <h1 style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 600, letterSpacing: 2, color: '#e8f4ff' }}>
          <span style={{ color: '#e8f4ff', fontWeight: 600 }}>Eco</span>
          <span style={{ color: '#00d4ff', fontWeight: 700, marginLeft: 2 }}>Verse</span>
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
            forecastMask={realtime.forecastMask}
            containsForecast={realtime.containsForecast}
            forecastFromHour={realtime.forecastFromHour}
            manualRefreshing={realtime.manualRefreshing}
            onManualRefresh={realtime.triggerManualRefresh}
          />

          <span className="hud-chip" title={`展示日期 ${datasetMeta.viewDate || '本地默认'} | 快照 ${datasetMeta.snapshotAt || '--'}`}>
            {datasetMeta.emergencyActive ? 'EMERGENCY' : datasetMeta.isHistorical ? 'HISTORY' : 'LIVE'} {datasetMeta.viewDate || 'LOCAL'}
          </span>
          <span className="hud-chip" title="当前图表展示的数据快照时间">
            截止 {datasetMeta.snapshotAt ? datasetMeta.snapshotAt.slice(5, 16) : '--'}
          </span>

          {datasetMeta.emergencyActive ? (
            <>
              <span className="hud-chip live" title={datasetMeta.emergencyTitle || '应急态'}>
                EMERGENCY MODE
              </span>
              <button
                type="button"
                onClick={async () => {
                  const restored = await restoreEmergencyStateApi(emergencyActiveRun?.id ?? datasetMeta.emergencyRunId ?? null)
                  restoreNormalDatasetState(restored.baselineDataset.data, restored.baselineDataset.meta)
                  setEmergencyPreviewRun(restored.run)
                }}
                className="rounded-sm border border-[#ff7043] bg-[#ff7043]/12 px-3 py-1.5 font-mono text-[11px] tracking-[0.16em] text-[#ffb199] transition-all hover:bg-[#ff7043]/18"
              >
                回退正常状态
              </button>
            </>
          ) : null}

          {!datasetMeta.isHistorical && datasetMeta.containsForecast ? (
            <span className="hud-chip" title="今日未来小时以 forecast 标识返回，不再伪装成已实时落地">
              FCST {String(datasetMeta.forecastFromHour ?? 0).padStart(2, '0')}:00+
            </span>
          ) : null}

          <button
            ref={logButtonRef}
            type="button"
            onClick={() => setLogOpen((value) => !value)}
            className={`flex items-center gap-2 rounded-sm border px-3 py-1.5 font-mono text-[11px] tracking-[0.16em] transition-all ${
              logOpen
                ? 'border-cyan-300 bg-cyan-400/12 text-cyan-200 shadow-[0_0_24px_rgba(0,212,255,0.18)]'
                : 'border-[#1e3256] bg-[#111b2e] text-[#8ba9cc] hover:border-cyan-400/60 hover:text-cyan-200'
            }`}
            title={latestLog?.message || '查看后端日志'}
          >
            <FileText size={14} />
            日志
            <span className={`h-2 w-2 rounded-full ${activeLogCount ? 'bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.95)]' : 'bg-slate-600'}`} />
            <span>{String(realtime.serverLogs.length).padStart(2, '0')}</span>
          </button>

          <TimeTravelPopover />
          <ParkConfigPopover />
          <span className="hud-chip">24 H</span>
          <span className="hud-chip">6 STRATEGIES</span>
          <span className="hud-chip live">INTERACTIVE</span>
        </div>
      </header>

      <div className="relative z-[20] flex gap-px px-8" style={{ background: '#0d1422', borderBottom: '1px solid #1e3256' }}>
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to
          return (
            <Link key={to} to={to} className={`hud-nav-link ${active ? 'active' : ''}`}>
              <Icon size={13} />
              {label}
            </Link>
          )
        })}
        <div className="ml-auto flex items-center">
          <StrategySwitcher />
        </div>
      </div>

      <div className="relative z-[1] flex min-h-0 flex-1 overflow-hidden">
        <main className="min-h-0 flex-1 overflow-hidden p-5">
          <Outlet />
        </main>
        <div className="relative h-full shrink-0">
          <AgentSidebar realtimeData={realtime} />
        </div>
      </div>

      {logPanel}
    </div>
  )
}
