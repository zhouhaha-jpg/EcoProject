import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  AnomalyRun,
  DatasetMeta,
  EcoDataset,
  EmergencyRun,
  ExecutionTraceStep,
  InvestmentRun,
  ScenarioInsight,
  StrategyContextValue,
  StrategyKey,
} from '@/types'
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

type ExtendedStrategyContext = StrategyContextValue & {
  loadScenarioDataset: (
    ds: Record<string, unknown>,
    label: string,
    options?: { insight?: ScenarioInsight | null; trace?: ExecutionTraceStep[] | null },
  ) => void
  scenarioLabel: string | null
  scenarioDataset: EcoDataset | null
  scenarioInsight: ScenarioInsight | null
  scenarioTrace: ExecutionTraceStep[]
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
  investmentPlan: InvestmentRun | null
  setInvestmentPlan: (run: InvestmentRun | null) => void
  anomalyPreviewRun: AnomalyRun | null
  anomalyActiveRun: AnomalyRun | null
  setAnomalyPreviewRun: (run: AnomalyRun | null) => void
  applyAnomalyRunState: (run: AnomalyRun, dataset?: Record<string, unknown>, meta?: DatasetMeta) => void
  restoreNormalDatasetState: (data?: Record<string, unknown>, meta?: DatasetMeta) => void
  resetWorkspaceState: (options?: { restoreDisplay?: boolean }) => void
}

const StrategyContext = createContext<ExtendedStrategyContext | null>(null)

const ALL_STRATEGIES: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']

export function StrategyProvider({ children }: { children: ReactNode }) {
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>('uci')
  const [selectedStrategies, setSelectedStrategies] = useState<Set<StrategyKey>>(() => new Set(ALL_STRATEGIES))
  const [currentTime, setCurrentTime] = useState(new Date())
  const [dataset, setDataset] = useState(DATASET)
  const [datasetMeta, setDatasetMeta] = useState<DatasetMeta>(FALLBACK_META)
  const [datasetLoading, setDatasetLoading] = useState(true)
  const [datasetError, setDatasetError] = useState<string | null>(null)
  const [scenarioDataset, setScenarioDataset] = useState<EcoDataset | null>(null)
  const [scenarioLabel, setScenarioLabel] = useState<string | null>(null)
  const [scenarioInsight, setScenarioInsight] = useState<ScenarioInsight | null>(null)
  const [scenarioTrace, setScenarioTrace] = useState<ExecutionTraceStep[]>([])
  const [paretoData, setParetoData] = useState<ParetoData | null>(null)
  const [paretoLabel, setParetoLabel] = useState<string | null>(null)
  const [emergencyPreviewRun, setEmergencyPreviewRun] = useState<EmergencyRun | null>(null)
  const [emergencyActiveRun, setEmergencyActiveRun] = useState<EmergencyRun | null>(null)
  const [investmentPlan, setInvestmentPlan] = useState<InvestmentRun | null>(null)
  const [anomalyPreviewRun, setAnomalyPreviewRun] = useState<AnomalyRun | null>(null)
  const [anomalyActiveRun, setAnomalyActiveRun] = useState<AnomalyRun | null>(null)
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

  const initialLoadDone = useRef(false)

  const loadLatestDataset = useCallback(async () => {
    if (!initialLoadDone.current) {
      setDatasetLoading(true)
    }
    try {
      const { data, meta } = await fetchDisplayDataset()
      applyDisplayDataset(data, meta)
      setDatasetError(null)
    } catch (err) {
      console.warn('[StrategyContext] display dataset unavailable, using seed:', err instanceof Error ? err.message : err)
      if (!initialLoadDone.current) {
        setDataset(DATASET)
        setDatasetMeta(FALLBACK_META)
      }
      setDatasetError(err instanceof Error ? err.message : String(err))
    } finally {
      initialLoadDone.current = true
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

  const loadScenarioDataset = useCallback((
    ds: Record<string, unknown>,
    label: string,
    options?: { insight?: ScenarioInsight | null; trace?: ExecutionTraceStep[] | null },
  ) => {
    setScenarioDataset(ds as unknown as EcoDataset)
    setScenarioLabel(label)
    setScenarioInsight(options?.insight ?? null)
    setScenarioTrace(options?.trace ?? [])
    setParetoData(null)
    setParetoLabel(null)
    setInvestmentPlan(null)
    if (!emergencyActiveRun) setEmergencyPreviewRun(null)
    if (!anomalyActiveRun) setAnomalyPreviewRun(null)
  }, [anomalyActiveRun, emergencyActiveRun])

  const loadParetoData = useCallback((data: ParetoData, label: string) => {
    const results = data.results
    if (results.length < 2) {
      setParetoData({ ...data, optimalRange: undefined, suggestion: undefined })
      setParetoLabel(label)
      setScenarioDataset(null)
      setScenarioLabel(null)
      setScenarioInsight(null)
      setScenarioTrace([])
      setInvestmentPlan(null)
      return
    }
    const sorted = [...results].sort((a, b) => a.paramValue - b.paramValue)
    const paretoOptimal = sorted.filter((point, index) => (
      !sorted.some((other, otherIndex) => otherIndex !== index
        && other.cost <= point.cost
        && other.carbon <= point.carbon
        && (other.cost < point.cost || other.carbon < point.carbon))
    ))
    const byCombined = [...results].sort((a, b) => a.combined - b.combined)
    const topCombined = (paretoOptimal.length > 0 ? paretoOptimal : byCombined).slice(0, Math.max(1, Math.ceil(results.length * 0.4)))
    const minPv = Math.min(...topCombined.map((result) => result.paramValue))
    const maxPv = Math.max(...topCombined.map((result) => result.paramValue))
    setParetoData({
      ...data,
      optimalRange: { min: minPv, max: maxPv },
      suggestion: minPv === maxPv
        ? `建议 ${data.param_name}=${minPv}，综合指标最优。`
        : `建议 ${data.param_name}=${minPv}-${maxPv}，是成本与碳排的较优平衡区间。`,
    })
    setParetoLabel(label)
    setScenarioDataset(null)
    setScenarioLabel(null)
    setScenarioInsight(null)
    setScenarioTrace([])
    setInvestmentPlan(null)
    if (!emergencyActiveRun) setEmergencyPreviewRun(null)
    if (!anomalyActiveRun) setAnomalyPreviewRun(null)
  }, [anomalyActiveRun, emergencyActiveRun])

  const updateDataset = useCallback((data: Record<string, unknown>, meta?: DatasetMeta) => {
    applyDisplayDataset(data, meta)
  }, [applyDisplayDataset])

  const applyEmergencyRunState = useCallback((run: EmergencyRun, data?: Record<string, unknown>, meta?: DatasetMeta) => {
    const nextDataset = (data ?? run.emergencyDataset?.data) as EcoDataset | undefined
    const nextMeta = (meta ?? run.emergencyDataset?.meta ?? nextDataset?._meta ?? {}) as DatasetMeta
    if (!nextDataset) return

    setNormalDatasetBackup((current) => current ?? { data: dataset, meta: datasetMeta })
    setScenarioDataset(null)
    setScenarioLabel(null)
    setScenarioInsight(null)
    setScenarioTrace([])
    setParetoData(null)
    setParetoLabel(null)
    setInvestmentPlan(null)
    setAnomalyPreviewRun(null)
    setAnomalyActiveRun(null)
    applyDisplayDataset(nextDataset as unknown as Record<string, unknown>, {
      ...nextMeta,
      datasetType: 'emergency',
      emergencyActive: true,
      emergencyRunId: run.id,
      baselineDatasetId: run.baselineDatasetId ?? nextMeta.baselineDatasetId ?? null,
      emergencyTitle: run.title,
      emergencyMode: 'single',
      anomalyActive: false,
      anomalyRunId: null,
      anomalyTitle: '',
    })
    setEmergencyActiveRun(run)
    setEmergencyPreviewRun(run)
  }, [applyDisplayDataset, dataset, datasetMeta])

  const applyAnomalyRunState = useCallback((run: AnomalyRun, data?: Record<string, unknown>, meta?: DatasetMeta) => {
    const nextDataset = (data ?? run.anomalyDataset?.data) as EcoDataset | undefined
    const nextMeta = (meta ?? run.anomalyDataset?.meta ?? nextDataset?._meta ?? {}) as DatasetMeta
    if (!nextDataset) return

    setNormalDatasetBackup((current) => current ?? { data: dataset, meta: datasetMeta })
    setScenarioDataset(null)
    setScenarioLabel(null)
    setScenarioInsight(null)
    setScenarioTrace([])
    setParetoData(null)
    setParetoLabel(null)
    setInvestmentPlan(null)
    setEmergencyPreviewRun(null)
    setEmergencyActiveRun(null)
    applyDisplayDataset(nextDataset as unknown as Record<string, unknown>, {
      ...nextMeta,
      datasetType: 'anomaly',
      anomalyActive: true,
      anomalyRunId: run.id,
      anomalyTitle: run.title,
      emergencyActive: false,
      emergencyRunId: null,
      emergencyTitle: '',
    })
    setAnomalyActiveRun(run)
    setAnomalyPreviewRun(run)
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
      anomalyActive: false,
      anomalyRunId: null,
      anomalyTitle: '',
    })
    setEmergencyActiveRun(null)
    setAnomalyActiveRun(null)
    setNormalDatasetBackup(null)
  }, [applyDisplayDataset, normalDatasetBackup])

  const resetWorkspaceState = useCallback((options?: { restoreDisplay?: boolean }) => {
    setScenarioDataset(null)
    setScenarioLabel(null)
    setScenarioInsight(null)
    setScenarioTrace([])
    setParetoData(null)
    setParetoLabel(null)
    setInvestmentPlan(null)
    setEmergencyPreviewRun(null)
    setAnomalyPreviewRun(null)
    if (options?.restoreDisplay && (datasetMeta.emergencyActive || emergencyActiveRun || datasetMeta.anomalyActive || anomalyActiveRun)) {
      restoreNormalDatasetState()
    }
  }, [anomalyActiveRun, datasetMeta.anomalyActive, datasetMeta.emergencyActive, emergencyActiveRun, restoreNormalDatasetState])

  useEffect(() => {
    void loadLatestDataset()
  }, [loadLatestDataset])

  useEffect(() => {
    if (datasetMeta.isHistorical || datasetMeta.emergencyActive || datasetMeta.anomalyActive) return

    const interval = setInterval(() => {
      void loadLatestDataset().catch(() => {})
    }, 10 * 60 * 1000)

    return () => clearInterval(interval)
  }, [datasetMeta.anomalyActive, datasetMeta.emergencyActive, datasetMeta.isHistorical, loadLatestDataset])

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date()
      setCurrentTime((prev) => {
        if (prev.getHours() !== now.getHours() || prev.getMinutes() !== now.getMinutes()) {
          return now
        }
        return prev
      })
    }, 10_000)
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
      scenarioInsight,
      scenarioTrace,
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
      investmentPlan,
      setInvestmentPlan,
      anomalyPreviewRun,
      anomalyActiveRun,
      setAnomalyPreviewRun,
      applyAnomalyRunState,
      restoreNormalDatasetState,
      resetWorkspaceState,
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
