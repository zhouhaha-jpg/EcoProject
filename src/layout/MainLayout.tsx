import { Link, useLocation, Outlet } from 'react-router-dom'
import StrategySwitcher from '@/components/ui/StrategySwitcher'
import AgentSidebar from '@/components/agent/AgentSidebar'
import { Zap, Sun, Flame, Battery, Plug } from 'lucide-react'

const NAV = [
  { to: '/ca',  label: '电解槽',           icon: Battery },
  { to: '/pv',  label: '光伏',             icon: Sun },
  { to: '/gm',  label: '燃气轮机',         icon: Flame },
  { to: '/pem', label: '质子膜燃料电池',   icon: Zap },
  { to: '/g',   label: '电网',             icon: Plug },
]

export default function MainLayout() {
  const location = useLocation()

  return (
    <div className="scanlines h-screen w-full flex flex-col overflow-hidden" style={{ background: '#070c14' }}>
      {/* ── 顶栏（与参考 header 一致） ── */}
      <header className="hud-header relative z-10 shrink-0 flex items-center gap-5 px-8 py-4">
        <div className="logo-pulse" />
        <h1 style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 600, letterSpacing: 2, color: '#e8f4ff' }}>
          氯碱制氢数字孪生 <span style={{ color: '#00d4ff', fontWeight: 700 }}>功率对比</span> 分析平台
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="hud-chip">24 H</span>
          <span className="hud-chip">6 STRATEGIES</span>
          <span className="hud-chip live">● INTERACTIVE</span>
        </div>
      </header>

      {/* ── 视图标签（与参考 .view-tabs 一致） ── */}
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
        {/* 策略切换放在右侧 */}
        <div className="ml-auto flex items-center">
          <StrategySwitcher />
        </div>
      </div>

      {/* ── 主体 + Agent 侧边栏 ── */}
      <div className="relative z-[1] flex-1 min-h-0 flex overflow-hidden">
        <main className="flex-1 min-h-0 overflow-hidden p-5">
          <Outlet />
        </main>
        <div className="relative shrink-0 h-full">
          <AgentSidebar />
        </div>
      </div>
    </div>
  )
}
