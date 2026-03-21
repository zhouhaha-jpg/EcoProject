import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { StrategyContextValue, StrategyKey, EcoDataset, DatasetMeta, EmergencyRun } from '@/types'
import { DATASET, STRATEGY_META } from '@/data/realData'
import { fetchDisplayDataset } from '@/lib/api'

export interface ParetoResult {
  paramValue: number
  cost: number
  carbon: number
  combined: number
}

export interface ParetoData {
  param_name: string
  strategy: string
  results: ParetoResult[]
  optimalRange?: { min: number; max: number }
  suggestion?: string
}

const FALLBACK_META: DatasetMeta = {
  datasetType: 'seed',
  viewDate: '',
  snapshotAt: '',
  isHistorical: false,
  datasetName: '本地种子数据',
}

const StrategyContext = createContext<(StrategyContextValue & {
  loadScenarioDataset: (ds: Record<string, unknown>, label: string) => void
  scenarioLabel: string | null
  scenarioDataset: EcoDataset | null
  loadParetoData: (data: ParetoData, label: string) => void
  paretoLabel: string | null
  paretoData: ParetoData | null
  datasetMeta: DatasetMeta
  loadDisplayDataset: (date: string) => Promise<void>
  loadLatestDataset: () => Promise<void>
  updateDataset: (data: Record<string, unknown>, meta?: DatasetMeta) => void
  emergencyPreviewRun: EmergencyRun | null
  emergencyActiveRun: EmergencyRun | null
  setEmergencyPreviewRun: (run: EmergencyRun | null) => void
  applyEmergencyRunState: (run: EmergencyRun, dataset?: Record<string, unknown>, meta?: DatasetMeta) => void
  restoreNormalDatasetState: (data?: Record<string, unknown>, meta?: DatasetMeta) => void
}) | null>(null)

const ALL_STRATEGIES: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']

export function StrategyProvider({ children }: { children: ReactNode }) {
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>('uci')
  const [selectedStrategies, setSelectedStrategies] = useState<Set<StrategyKey>>(
    () => new Set(ALL_STRATEGIES)
  )
  const [currentTime, setCurrentTime] = useState(new Date())
  const [dataset, setDataset] = useState(DATASET)
  const [datasetMeta, setDatasetMeta] = useState<DatasetMeta>(FALLBACK_META)
  const [datasetLoading, setDatasetLoading] = useState(true)
  const [datasetError, setDatasetError] = useState<string | null>(null)
  const [scenarioDataset, setScenarioDataset] = useState<EcoDataset | null>(null)
  const [scenarioLabel, setScenarioLabel] = useState<string | null>(null)
  const [paretoData, setParetoData] = useState<ParetoData | null>(null)
  const [paretoLabel, setParetoLabel] = useState<string | null>(null)
  const [emergencyPreviewRun, setEmergencyPreviewRun] = useState<EmergencyRun | null>(null)
  const [emergencyActiveRun, setEmergencyActiveRun] = useState<EmergencyRun | null>(null)
  const [normalDatasetBackup, setNormalDatasetBackup] = useState<{ data: EcoDataset; meta: DatasetMeta } | null>(null)

  const toggleStrategy = (key: StrategyKey) => {
    setSelectedStrategies((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
        if (next.size === 0) next.add(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const applyDisplayDataset = useCallback((data: Record<string, unknown>, meta?: DatasetMeta) => {
    const nextDataset = data as unknown as EcoDataset
    setDataset(nextDataset)
    setDatasetMeta(meta ?? nextDataset._meta ?? FALLBACK_META)
  }, [])

  const loadLatestDataset = useCallback(async () => {
    setDatasetLoading(true)
    try {
      const { data, meta } = await fetchDisplayDataset()
      applyDisplayDataset(data, meta)
      setDatasetError(null)
    } catch (err) {
      console.warn('[StrategyContext] 实时展示数据不可用，使用本地数据:', err instanceof Error ? err.message : err)
      setDataset(DATASET)
      setDatasetMeta(FALLBACK_META)
      setDatasetError(err instanceof Error ? err.message : String(err))
    } finally {
      setDatasetLoading(false)
    }
  }, [applyDisplayDataset])

  const loadDisplayDataset = useCallback(async (date: string) => {
    setDatasetLoading(true)
    try {
      const { data, meta } = await fetchDisplayDataset(date)
      applyDisplayDataset(data, meta)
      setDatasetError(null)
    } catch (err) {
      setDatasetError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setDatasetLoading(false)
    }
  }, [applyDisplayDataset])

  const loadScenarioDataset = useCallback((ds: Record<string, unknown>, label: string) => {
    setScenarioDataset(ds as unknown as EcoDataset)
    setScenarioLabel(label)
    setParetoData(null)
    setParetoLabel(null)
    if (!emergencyActiveRun) {
      setEmergencyPreviewRun(null)
    }
  }, [emergencyActiveRun])

  const loadParetoData = useCallback((data: ParetoData, label: string) => {
    const results = data.results
    if (results.length < 2) {
      setParetoData({ ...data, optimalRange: undefined, suggestion: undefined })
      setParetoLabel(label)
      return
    }
    const sorted = [...results].sort((a, b) => a.paramValue - b.paramValue)
    const paretoOptimal = sorted.filter((p, i) => {
      return !sorted.some((q, j) => j !== i && q.cost <= p.cost && q.carbon <= p.carbon && (q.cost < p.cost || q.carbon < p.carbon))
    })
    const byCombined = [...results].sort((a, b) => a.combined - b.combined)
    const topCombined = (paretoOptimal.length > 0 ? paretoOptimal : byCombined).slice(0, Math.max(1, Math.ceil(results.length * 0.4)))
    const minPv = Math.min(...topCombined.map((r) => r.paramValue))
    const maxPv = Math.max(...topCombined.map((r) => r.paramValue))
    const optimalRange = { min: minPv, max: maxPv }
    const suggestion =
      minPv === maxPv
        ? `建议 ${data.param_name}=${minPv}，综合指标最优`
        : `建议 ${data.param_name}=${minPv}-${maxPv}，是成本-碳排的较优平衡区间`
    setParetoData({ ...data, optimalRange, suggestion })
    setParetoLabel(label)
    setScenarioDataset(null)
    setScenarioLabel(null)
    if (!emergencyActiveRun) {
      setEmergencyPreviewRun(null)
    }
  }, [emergencyActiveRun])

  const updateDataset = useCallback((data: Record<string, unknown>, meta?: DatasetMeta) => {
    applyDisplayDataset(data, meta)
  }, [applyDisplayDataset])

  const applyEmergencyRunState = useCallback((run: EmergencyRun, data?: Record<string, unknown>, meta?: DatasetMeta) => {
    const nextDataset = (data ?? run.emergencyDataset?.data) as EcoDataset | undefined
    const nextMeta = (meta
      ?? run.emergencyDataset?.meta
      ?? nextDataset?._meta
      ?? {}) as DatasetMeta

    if (!nextDataset) return

    setNormalDatasetBackup((current) => current ?? { data: dataset, meta: datasetMeta })
    applyDisplayDataset(nextDataset as unknown as Record<string, unknown>, {
      ...nextMeta,
      datasetType: 'emergency',
      emergencyActive: true,
      emergencyRunId: run.id,
      baselineDatasetId: run.baselineDatasetId ?? nextMeta.baselineDatasetId ?? null,
      emergencyTitle: run.title,
      isHistorical: false,
    })
    setEmergencyActiveRun(run)
    setEmergencyPreviewRun(run)
  }, [applyDisplayDataset, dataset, datasetMeta])

  const restoreNormalDatasetState = useCallback((data?: Record<string, unknown>, meta?: DatasetMeta) => {
    const fallback = normalDatasetBackup
    const nextDataset = (data as EcoDataset | undefined) ?? fallback?.data
    const nextMeta = meta ?? fallback?.meta
    if (!nextDataset || !nextMeta) return
    applyDisplayDataset(nextDataset as unknown as Record<string, unknown>, {
      ...nextMeta,
      emergencyActive: false,
      emergencyRunId: null,
      emergencyTitle: '',
    })
    setEmergencyActiveRun(null)
    setNormalDatasetBackup(null)
  }, [applyDisplayDataset, normalDatasetBackup])

  useEffect(() => {
    loadLatestDataset()
  }, [loadLatestDataset])

  useEffect(() => {
    if (datasetMeta.isHistorical || datasetMeta.emergencyActive) return

    const refresh = () => {
      loadLatestDataset().catch(() => {
        // keep the last visible dataset on transient failures
      })
    }

    const interval = setInterval(refresh, 2 * 60 * 1000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }

    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [datasetMeta.emergencyActive, datasetMeta.isHistorical, loadLatestDataset])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <StrategyContext.Provider value={{
      activeStrategy,
      setActiveStrategy,
      selectedStrategies,
      toggleStrategy,
      dataset,
      strategyMeta: STRATEGY_META,
      currentTime,
      datasetLoading,
      datasetError,
      datasetMeta,
      loadScenarioDataset,
      scenarioLabel,
      scenarioDataset,
      loadParetoData,
      paretoLabel,
      paretoData,
      loadDisplayDataset,
      loadLatestDataset,
      updateDataset,
      emergencyPreviewRun,
      emergencyActiveRun,
      setEmergencyPreviewRun,
      applyEmergencyRunState,
      restoreNormalDatasetState,
    }}>
      {children}
    </StrategyContext.Provider>
  )
}

export function useStrategy() {
  const ctx = useContext(StrategyContext)
  if (!ctx) throw new Error('useStrategy must be used inside StrategyProvider')
  return ctx
}
