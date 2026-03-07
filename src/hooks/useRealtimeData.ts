/**
 * WebSocket 客户端 + 实时数据状态管理
 *
 * 功能：
 * - 连接后端 WebSocket (/ws)，自动重连
 * - 维护 24h 电价/光照/碳因子实时数据
 * - 维护数据源健康状态
 * - 维护预警事件队列
 * - 轮询兜底（WS 断连时每 60s GET /api/realtime/latest）
 */

import { useState, useEffect, useRef, useCallback } from 'react'

export interface DataSources {
  price: 'crawler' | 'simulator' | 'fallback'
  solar: 'openmeteo' | 'fallback'
  carbon: 'model' | 'fallback'
}

export interface DataSourceHealth {
  solar: { status: string; lastSuccess?: string; fallbackActive: boolean }
  price: { status: string; lastSuccess?: string; fallbackActive: boolean }
  carbon: { status: string; lastSuccess?: string; fallbackActive: boolean }
}

export interface AlertEvent {
  event_type: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail?: string
}

export interface ShadowOptimization {
  datasetId: number
  datasetName: string
  summary: Record<string, { cost: number; carbon: number; combined: number }>
  alerts: AlertEvent[]
  suggestion: string
}

export interface RealtimeState {
  prices: number[]
  solar: number[]
  carbon: number[]
  sources: DataSources
  lastUpdated: string
  health: DataSourceHealth
  connected: boolean
  alerts: AlertEvent[]
  shadowOptimization: ShadowOptimization | null
  loading: boolean
  latestOptDataset: Record<string, unknown> | null
}

const DEFAULT_SOURCES: DataSources = {
  price: 'fallback',
  solar: 'fallback',
  carbon: 'fallback',
}

const DEFAULT_HEALTH: DataSourceHealth = {
  solar: { status: 'ok', fallbackActive: false },
  price: { status: 'ok', fallbackActive: false },
  carbon: { status: 'ok', fallbackActive: false },
}

const API_BASE = ''

export function useRealtimeData(): RealtimeState & {
  fetchLatest: () => Promise<void>
  dismissAlert: (index: number) => void
  dismissShadowOpt: () => void
} {
  const [prices, setPrices] = useState<number[]>([])
  const [solar, setSolar] = useState<number[]>([])
  const [carbon, setCarbon] = useState<number[]>([])
  const [sources, setSources] = useState<DataSources>(DEFAULT_SOURCES)
  const [lastUpdated, setLastUpdated] = useState('')
  const [health, setHealth] = useState<DataSourceHealth>(DEFAULT_HEALTH)
  const [connected, setConnected] = useState(false)
  const [alerts, setAlerts] = useState<AlertEvent[]>([])
  const [shadowOptimization, setShadowOptimization] = useState<ShadowOptimization | null>(null)
  const [loading, setLoading] = useState(true)
  const [latestOptDataset, setLatestOptDataset] = useState<Record<string, unknown> | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()
  const pollTimer = useRef<ReturnType<typeof setInterval>>()

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/realtime/latest`)
      if (!res.ok) return
      const data = await res.json()
      if (data.prices?.length === 24) {
        setPrices(data.prices)
        setSolar(data.solar)
        setCarbon(data.carbon)
        setSources(data.sources || DEFAULT_SOURCES)
        setLastUpdated(data.fetched_at || new Date().toISOString())
        if (data.alerts?.length) {
          setAlerts(prev => [...data.alerts, ...prev].slice(0, 20))
        }
      }
    } catch (e) {
      console.warn('[realtime] fetch 失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/realtime/health`)
      if (!res.ok) return
      const data = await res.json()
      setHealth(data)
    } catch {
      // ignore
    }
  }, [])

  // WebSocket 连接
  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = window.location.hostname
    const port = 5000 // backend port
    const url = `${protocol}://${host}:${port}/ws`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        // WS 连接成功，清除轮询
        if (pollTimer.current) {
          clearInterval(pollTimer.current)
          pollTimer.current = undefined
        }
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          switch (msg.type) {
            case 'data_updated':
              if (msg.payload.prices?.length === 24) {
                setPrices(msg.payload.prices)
                setSolar(msg.payload.solar)
                setCarbon(msg.payload.carbon)
                setSources(msg.payload.sources || DEFAULT_SOURCES)
                setLastUpdated(msg.payload.fetched_at || new Date().toISOString())
              }
              break
            case 'alert':
              setAlerts(prev => [msg.payload, ...prev].slice(0, 20))
              break
            case 'optimization_complete':
              setShadowOptimization(msg.payload)
              break
            case 'dataset_updated':
              if (msg.payload?.data) {
                setLatestOptDataset(msg.payload.data)
              }
              break
            case 'health_update':
              fetchHealth()
              break
          }
        } catch {
          // ignore invalid messages
        }
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        // 启动重连
        reconnectTimer.current = setTimeout(connectWs, 5000)
        // 启动轮询兜底
        if (!pollTimer.current) {
          pollTimer.current = setInterval(fetchLatest, 60_000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      setConnected(false)
      reconnectTimer.current = setTimeout(connectWs, 5000)
    }
  }, [fetchLatest, fetchHealth])

  const dismissAlert = useCallback((index: number) => {
    setAlerts(prev => prev.filter((_, i) => i !== index))
  }, [])

  const dismissShadowOpt = useCallback(() => {
    setShadowOptimization(null)
  }, [])

  // 初始化
  useEffect(() => {
    fetchLatest()
    fetchHealth()
    connectWs()

    return () => {
      wsRef.current?.close()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [fetchLatest, fetchHealth, connectWs])

  return {
    prices, solar, carbon, sources, lastUpdated,
    health, connected, alerts, shadowOptimization, loading,
    latestOptDataset,
    fetchLatest, dismissAlert, dismissShadowOpt,
  }
}
