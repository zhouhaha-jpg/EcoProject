import { useState, useEffect, useRef, useCallback } from 'react'
import type { DatasetMeta, ServerLogEntry } from '@/types'

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

export interface LatestOptDatasetPayload {
  datasetId: number
  datasetName: string
  data: Record<string, unknown>
  meta?: DatasetMeta
}

export interface RealtimeState {
  prices: number[]
  solar: number[]
  carbon: number[]
  forecastMask: boolean[]
  containsForecast: boolean
  forecastFromHour: number | null
  sources: DataSources
  lastUpdated: string
  health: DataSourceHealth
  connected: boolean
  alerts: AlertEvent[]
  shadowOptimization: ShadowOptimization | null
  loading: boolean
  manualRefreshing: boolean
  latestOptDataset: LatestOptDatasetPayload | null
  serverLogs: ServerLogEntry[]
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
  triggerManualRefresh: () => Promise<void>
  dismissAlert: (index: number) => void
  dismissShadowOpt: () => void
} {
  const [prices, setPrices] = useState<number[]>([])
  const [solar, setSolar] = useState<number[]>([])
  const [carbon, setCarbon] = useState<number[]>([])
  const [forecastMask, setForecastMask] = useState<boolean[]>([])
  const [containsForecast, setContainsForecast] = useState(false)
  const [forecastFromHour, setForecastFromHour] = useState<number | null>(null)
  const [sources, setSources] = useState<DataSources>(DEFAULT_SOURCES)
  const [lastUpdated, setLastUpdated] = useState('')
  const [health, setHealth] = useState<DataSourceHealth>(DEFAULT_HEALTH)
  const [connected, setConnected] = useState(false)
  const [alerts, setAlerts] = useState<AlertEvent[]>([])
  const [shadowOptimization, setShadowOptimization] = useState<ShadowOptimization | null>(null)
  const [loading, setLoading] = useState(true)
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const [latestOptDataset, setLatestOptDataset] = useState<LatestOptDatasetPayload | null>(null)
  const [serverLogs, setServerLogs] = useState<ServerLogEntry[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()
  const pollTimer = useRef<ReturnType<typeof setInterval>>()

  const appendServerLog = useCallback((entry: ServerLogEntry) => {
    setServerLogs((prev) => {
      const next = [entry, ...prev.filter((item) => item.id !== entry.id)]
      return next.slice(0, 200)
    })
  }, [])

  const applyRealtimePayload = useCallback((data: Record<string, unknown>) => {
    const nextPrices = Array.isArray(data.prices) ? data.prices as number[] : []
    if (nextPrices.length !== 24) return false

    setPrices(nextPrices)
    setSolar(Array.isArray(data.solar) ? data.solar as number[] : [])
    setCarbon(Array.isArray(data.carbon) ? data.carbon as number[] : [])
    setSources((data.sources as DataSources) || DEFAULT_SOURCES)
    setLastUpdated(String(data.fetched_at || new Date().toISOString()))
    setForecastMask(Array.isArray(data.forecast_mask) ? data.forecast_mask.map(Boolean) : [])
    setContainsForecast(Boolean(data.contains_forecast))
    setForecastFromHour(typeof data.forecast_from_hour === 'number' ? data.forecast_from_hour : null)
    if (Array.isArray(data.alerts) && data.alerts.length) {
      setAlerts((prev) => [...data.alerts as AlertEvent[], ...prev].slice(0, 20))
    }
    return true
  }, [])

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/realtime/latest`)
      if (!res.ok) return
      const data = await res.json()
      applyRealtimePayload(data)
    } catch (error) {
      console.warn('[realtime] fetch failed:', error)
    } finally {
      setLoading(false)
    }
  }, [applyRealtimePayload])

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/realtime/health`)
      if (!res.ok) return false
      const data = await res.json()
      setHealth(data)
      return true
    } catch {
      return false
    }
  }, [])

  const triggerManualRefresh = useCallback(async () => {
    try {
      setManualRefreshing(true)
      const res = await fetch(`${API_BASE}/api/realtime/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        throw new Error(await res.text())
      }
      const data = await res.json()
      if (data.fetchResult) {
        applyRealtimePayload(data.fetchResult)
      }
      if (data.dataset?.data) {
        setLatestOptDataset(data.dataset)
      }
    } finally {
      setManualRefreshing(false)
    }
  }, [applyRealtimePayload])

  const startPolling = useCallback(() => {
    if (pollTimer.current) return
    pollTimer.current = setInterval(() => {
      void fetchLatest()
    }, 60_000)
  }, [fetchLatest])

  const stopPolling = useCallback(() => {
    if (!pollTimer.current) return
    clearInterval(pollTimer.current)
    pollTimer.current = undefined
  }, [])

  const scheduleReconnect = useCallback((connect: () => Promise<void>) => {
    if (reconnectTimer.current) return
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = undefined
      void connect()
    }, 5000)
  }, [])

  const connectWs = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return

    const backendReady = await fetchHealth()
    if (!backendReady) {
      setConnected(false)
      startPolling()
      scheduleReconnect(connectWs)
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = window.location.hostname
    const port = 5000
    const url = `${protocol}://${host}:${port}/ws`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        stopPolling()
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          switch (msg.type) {
            case 'data_updated':
              applyRealtimePayload(msg.payload)
              break
            case 'alert':
              setAlerts((prev) => [msg.payload, ...prev].slice(0, 20))
              break
            case 'optimization_complete':
              setShadowOptimization(msg.payload)
              break
            case 'dataset_updated':
              if (msg.payload?.data) {
                setLatestOptDataset(msg.payload)
              }
              break
            case 'health_update':
              fetchHealth()
              break
            case 'server_logs_snapshot':
              setServerLogs(Array.isArray(msg.payload) ? msg.payload.slice(0, 200) : [])
              break
            case 'server_log':
              if (msg.payload?.id) {
                appendServerLog(msg.payload)
              }
              break
            default:
              break
          }
        } catch {
          // ignore invalid messages
        }
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        startPolling()
        scheduleReconnect(connectWs)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      setConnected(false)
      startPolling()
      scheduleReconnect(connectWs)
    }
  }, [appendServerLog, applyRealtimePayload, fetchHealth, fetchLatest, scheduleReconnect, startPolling, stopPolling])

  const dismissAlert = useCallback((index: number) => {
    setAlerts((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const dismissShadowOpt = useCallback(() => {
    setShadowOptimization(null)
  }, [])

  useEffect(() => {
    void fetchLatest()
    void connectWs()

    return () => {
      const socket = wsRef.current
      wsRef.current = null

      if (socket) {
        socket.onopen = null
        socket.onmessage = null
        socket.onclose = null
        socket.onerror = null
        if (socket.readyState === WebSocket.OPEN) {
          socket.close()
        }
      }
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [connectWs, fetchLatest])

  return {
    prices,
    solar,
    carbon,
    forecastMask,
    containsForecast,
    forecastFromHour,
    sources,
    lastUpdated,
    health,
    connected,
    alerts,
    shadowOptimization,
    loading,
    manualRefreshing,
    latestOptDataset,
    serverLogs,
    fetchLatest,
    triggerManualRefresh,
    dismissAlert,
    dismissShadowOpt,
  }
}
