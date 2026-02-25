import { Link, useLocation, Outlet } from 'react-router-dom'
import { useStrategy } from '@/context/StrategyContext'
import StrategySwitcher from '@/components/ui/StrategySwitcher'
import { LayoutDashboard, Zap, Factory, Wrench, ShieldCheck } from 'lucide-react'

const NAV = [
  { to: '/',           label: '总览',   icon: LayoutDashboard },
  { to: '/energy',     label: '能源',   icon: Zap },
  { to: '/production', label: '生产',   icon: Factory },
  { to: '/equipment',  label: '装备',   icon: Wrench },
  { to: '/hse',        label: 'HSE',    icon: ShieldCheck },
]

export default function MainLayout() {
  const { currentTime } = useStrategy()
  const location = useLocation()

  const timeStr = currentTime.toLocaleTimeString('zh-CN', { hour12: false })
  const dateStr = currentTime.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })

  return (
    <div className="scanlines min-h-screen w-full flex flex-col bg-cyber-black text-text-primary overflow-hidden" style={{ fontFamily: 'Rajdhani, "Noto Sans SC", sans-serif' }}>
      {/* HEADER */}
      <header className="hud-header shrink-0 h-14 flex items-center px-6 gap-6 backdrop-blur-sm z-50">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse shadow-neon-cyan" />
          <div className="w-8 h-8 clip-cyber-sm bg-neon-cyan/15 border border-neon-cyan/60 flex items-center justify-center">
            <span className="text-neon-cyan text-xs font-display font-bold tracking-wide">EC</span>
          </div>
          <div className="leading-tight">
            <div className="text-xs font-display tracking-widest text-neon-cyan uppercase neon-text-sm">EcoSys</div>
            <div className="text-[10px] text-text-muted font-body">工业数字孪生平台</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-1 ml-4">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to
            return (
              <Link
                key={to}
                to={to}
                className={`hud-nav-link flex items-center gap-1.5 px-3 py-1.5 text-xs font-display tracking-wider uppercase transition-all duration-200 rounded ${
                  active
                    ? 'active'
                    : ''
                }`}
              >
                <Icon size={13} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Strategy switcher */}
        <div className="ml-auto flex items-center gap-4">
          <div className="hidden xl:flex items-center gap-2">
            <span className="hud-chip">24H</span>
            <span className="hud-chip">6 STRATEGIES</span>
            <span className="hud-chip live">● INTERACTIVE</span>
          </div>
          <StrategySwitcher />
          <div className="text-right border-l border-border-cyber pl-4">
            <div className="font-mono text-sm text-neon-cyan" style={{ textShadow: '0 0 8px #00F3FF66' }}>{timeStr}</div>
            <div className="text-[10px] text-text-muted">{dateStr}</div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT — ScaleContainer */}
      <main className="flex-1 min-h-0 overflow-hidden p-4">
        <div
          className="w-full min-h-0 overflow-hidden"
          style={{ height: 'calc(100vh - 3.5rem - 2rem)' }}
        >
          <Outlet />
        </div>
      </main>
    </div>
  )
}
