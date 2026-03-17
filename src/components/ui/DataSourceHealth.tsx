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
  forecastMask: boolean[]
  containsForecast: boolean
  forecastFromHour: number | null
  manualRefreshing: boolean
  onManualRefresh: () => Promise<void>
}

function getSourceColor(source: string, healthStatus: string): string {
  if (source === 'crawler' || source === 'openmeteo' || source === 'model') {
    return healthStatus === 'ok' ? '#00ff88' : '#00ff88'
  }
  if (source === 'simulator') return '#ffcc00'
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

export default function DataSourceHealth({
  sources,
  health,
  connected,
  lastUpdated,
  prices,
  solar,
  carbon,
  forecastMask,
  containsForecast,
  forecastFromHour,
  manualRefreshing,
  onManualRefresh,
}: Props) {
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
    <div className="relative z-[120] flex items-center gap-2">
      {items.map(({ key, icon, label, source, health: currentHealth }) => {
        const color = getSourceColor(source, currentHealth?.status || 'ok')
        const statusLabel = getSourceLabel(key, source)
        return (
          <button
            key={key}
            type="button"
            className="flex cursor-pointer select-none items-center gap-1 rounded px-2 py-0.5 text-xs transition-all hover:brightness-125"
            style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${color}30` }}
            title={`${label}: ${statusLabel} (${source})，点击查看详情`}
            onClick={() => setPanelOpen((value) => !value)}
          >
            <span>{icon}</span>
            <span style={{ color, fontWeight: 600, fontSize: 10 }}>{statusLabel}</span>
          </button>
        )
      })}

      <button
        type="button"
        onClick={() => setPanelOpen((value) => !value)}
        className="flex items-center gap-1 rounded px-2 py-0.5 text-xs"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid ${containsForecast ? '#ffcc0030' : '#00ff8830'}`,
        }}
        title={containsForecast && forecastFromHour != null
          ? `${String(forecastFromHour).padStart(2, '0')}:00 之后为预测小时`
          : '当前 24h 均已落地'}
      >
        <span style={{ color: containsForecast ? '#ffcc00' : '#00ff88', fontSize: 10, fontWeight: 600 }}>
          {containsForecast && forecastFromHour != null ? `预测 ${String(forecastFromHour).padStart(2, '0')}:00+` : '全为实况'}
        </span>
      </button>

      <div
        className="flex items-center gap-1 rounded px-2 py-0.5 text-xs"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid ${connected ? '#00ff8830' : '#ff444430'}`,
        }}
        title={connected ? 'WebSocket 已连接' : 'WebSocket 已断开，当前使用轮询兜底'}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            display: 'inline-block',
            background: connected ? '#00ff88' : '#ff4444',
          }}
        />
        <span style={{ color: '#8899aa', fontSize: 10 }}>{time}</span>
      </div>

      {panelOpen ? (
        <RealtimeDataPanel
          prices={prices}
          solar={solar}
          carbon={carbon}
          forecastMask={forecastMask}
          containsForecast={containsForecast}
          forecastFromHour={forecastFromHour}
          sources={sources}
          lastUpdated={lastUpdated}
          manualRefreshing={manualRefreshing}
          onManualRefresh={onManualRefresh}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </div>
  )
}
