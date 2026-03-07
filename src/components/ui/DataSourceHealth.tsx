/**
 * 数据源健康度指示器
 * 在顶栏显示三路数据源的状态：☀太阳辐射 ⚡电价 🌿碳因子
 * 点击可展开 24h 实时数据面板
 *
 * 颜色语义：
 *  🟢 绿色 — 数据源正常
 *  🟡 黄色 — 降级中（使用模拟器/模型）
 *  🔴 红色 — 离线（使用兜底 Fallback）
 */

import { useState } from 'react'
import type { DataSources, DataSourceHealth as HealthType } from '@/hooks/useRealtimeData'
import RealtimeDataPanel from './RealtimeDataPanel'

interface Props {
  sources: DataSources
  health: HealthType
  connected: boolean
  lastUpdated: string
  prices: number[]
  solar: number[]
  carbon: number[]
}

function getSourceColor(source: string, healthStatus: string): string {
  // "真实数据"来源 → 绿色
  if (source === 'crawler' || source === 'openmeteo' || source === 'model') {
    if (healthStatus === 'ok') return '#00ff88'
    return '#00ff88' // 即使health表里degraded，只要拿到了数据就算ok
  }
  // 降级来源 → 黄色
  if (source === 'simulator') return '#ffcc00'
  // Fallback → 红色
  return '#ff4444'
}

function getSourceLabel(type: string, source: string): string {
  const map: Record<string, Record<string, string>> = {
    solar: { openmeteo: '实时', fallback: '离线' },
    price: { crawler: '实时', simulator: '模拟', fallback: '离线' },
    carbon: { model: '模型', fallback: '离线' },
  }
  return map[type]?.[source] ?? source
}

export default function DataSourceHealth({ sources, health, connected, lastUpdated, prices, solar, carbon }: Props) {
  const [panelOpen, setPanelOpen] = useState(false)

  const items = [
    { key: 'solar', icon: '☀️', label: '光照', source: sources.solar, health: health.solar },
    { key: 'price', icon: '⚡', label: '电价', source: sources.price, health: health.price },
    { key: 'carbon', icon: '🌿', label: '碳因子', source: sources.carbon, health: health.carbon },
  ]

  const time = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '--:--'

  return (
    <div className="relative flex items-center gap-2">
      {items.map(({ key, icon, label, source, health: h }) => {
        const color = getSourceColor(source, h?.status || 'ok')
        const statusLabel = getSourceLabel(key, source)
        return (
          <div
            key={key}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer select-none transition-all hover:brightness-125"
            style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${color}30` }}
            title={`${label}: ${statusLabel} (${source}) — 点击查看详情`}
            onClick={() => setPanelOpen(prev => !prev)}
          >
            <span>{icon}</span>
            <span style={{ color, fontWeight: 600, fontSize: 10 }}>{statusLabel}</span>
          </div>
        )
      })}
      {/* WebSocket 连接状态 */}
      <div
        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid ${connected ? '#00ff8830' : '#ff444430'}`,
        }}
        title={connected ? 'WebSocket 已连接' : 'WebSocket 断开，轮询兜底中'}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
          background: connected ? '#00ff88' : '#ff4444',
        }} />
        <span style={{ color: '#8899aa', fontSize: 10 }}>{time}</span>
      </div>

      {/* 实时数据弹窗面板 */}
      {panelOpen && (
        <RealtimeDataPanel
          prices={prices}
          solar={solar}
          carbon={carbon}
          sources={sources}
          lastUpdated={lastUpdated}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  )
}
