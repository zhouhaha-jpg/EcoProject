import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { StrategyContextValue, StrategyKey, EcoDataset } from '@/types'
import { DATASET, STRATEGY_META } from '@/data/realData'
import { fetchDefaultDataset } from '@/lib/api'

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

const StrategyContext = createContext<(StrategyContextValue & {
  loadScenarioDataset: (ds: Record<string, unknown>, label: string) => void
  scenarioLabel: string | null
  scenarioDataset: EcoDataset | null
  loadParetoData: (data: ParetoData, label: string) => void
  paretoLabel: string | null
  paretoData: ParetoData | null
  updateDataset: (data: Record<string, unknown>) => void
}) | null>(null)

const ALL_STRATEGIES: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']

export function StrategyProvider({ children }: { children: ReactNode }) {
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>('uci')
  const [selectedStrategies, setSelectedStrategies] = useState<Set<StrategyKey>>(
    () => new Set(ALL_STRATEGIES)
  )
  const [currentTime, setCurrentTime] = useState(new Date())

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
  const [dataset, setDataset] = useState(DATASET)
  const [datasetLoading, setDatasetLoading] = useState(true)
  const [datasetError, setDatasetError] = useState<string | null>(null)

  const [scenarioDataset, setScenarioDataset] = useState<EcoDataset | null>(null)
  const [scenarioLabel, setScenarioLabel] = useState<string | null>(null)

  const [paretoData, setParetoData] = useState<ParetoData | null>(null)
  const [paretoLabel, setParetoLabel] = useState<string | null>(null)

  const loadScenarioDataset = useCallback((ds: Record<string, unknown>, label: string) => {
    setScenarioDataset(ds as unknown as EcoDataset)
    setScenarioLabel(label)
    setParetoData(null)
    setParetoLabel(null)
  }, [])

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
    const topCombined = byCombined.slice(0, Math.max(1, Math.ceil(results.length * 0.4)))
    const minPv = Math.min(...topCombined.map((r) => r.paramValue))
    const maxPv = Math.max(...topCombined.map((r) => r.paramValue))
    const optimalRange = { min: minPv, max: maxPv }
    const suggestion =
      minPv === maxPv
        ? `建议 ${data.param_name}=${minPv}，综合指标最优`
        : `建议 ${data.param_name}=${minPv}-${maxPv}，是成本-碳排的最佳平衡区间`
    setParetoData({ ...data, optimalRange, suggestion })
    setParetoLabel(label)
    setScenarioDataset(null)
    setScenarioLabel(null)
  }, [])

  /** 接收实时优化推送的完整数据集，更新所有页面图表 */
  const updateDataset = useCallback((data: Record<string, unknown>) => {
    setDataset(data as unknown as typeof DATASET)
  }, [])

  useEffect(() => {
    fetchDefaultDataset()
      .then((data) => {
        setDataset(data as unknown as typeof DATASET)
        setDatasetError(null)
      })
      .catch((err) => {
        console.warn('[StrategyContext] API 不可用，使用本地数据:', err.message)
        setDataset(DATASET)
        setDatasetError(err.message)
      })
      .finally(() => setDatasetLoading(false))
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <StrategyContext.Provider value={{
      activeStrategy, setActiveStrategy,
      selectedStrategies, toggleStrategy,
      dataset,
      strategyMeta: STRATEGY_META,
      currentTime,
      datasetLoading,
      datasetError,
      loadScenarioDataset,
      scenarioLabel,
      scenarioDataset,
      loadParetoData,
      paretoLabel,
      paretoData,
      updateDataset,
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
