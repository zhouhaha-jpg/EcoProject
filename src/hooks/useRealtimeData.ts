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
  sources: DataSources
  lastUpdated: string
  health: DataSourceHealth
  connected: boolean
  alerts: AlertEvent[]
  shadowOptimization: ShadowOptimization | null
  loading: boolean
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
          setAlerts((prev) => [...data.alerts, ...prev].slice(0, 20))
        }
      }
    } catch (error) {
      console.warn('[realtime] fetch failed:', error)
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

  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = window.location.hostname
    const port = 5000
    const url = `${protocol}://${host}:${port}/ws`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
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
        reconnectTimer.current = setTimeout(connectWs, 5000)
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
  }, [appendServerLog, fetchHealth, fetchLatest])

  const dismissAlert = useCallback((index: number) => {
    setAlerts((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const dismissShadowOpt = useCallback(() => {
    setShadowOptimization(null)
  }, [])

  useEffect(() => {
    fetchLatest()
    fetchHealth()
    connectWs()

    return () => {
      wsRef.current?.close()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [connectWs, fetchHealth, fetchLatest])

  return {
    prices,
    solar,
    carbon,
    sources,
    lastUpdated,
    health,
    connected,
    alerts,
    shadowOptimization,
    loading,
    latestOptDataset,
    serverLogs,
    fetchLatest,
    dismissAlert,
    dismissShadowOpt,
  }
}
