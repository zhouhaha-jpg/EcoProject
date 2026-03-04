import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { StrategyContextValue, StrategyKey, EcoDataset } from '@/types'
import { DATASET, STRATEGY_META } from '@/data/realData'
import { fetchDefaultDataset } from '@/lib/api'

const StrategyContext = createContext<(StrategyContextValue & {
  loadScenarioDataset: (ds: Record<string, unknown>, label: string) => void
  scenarioLabel: string | null
  scenarioDataset: EcoDataset | null
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

  const loadScenarioDataset = useCallback((ds: Record<string, unknown>, label: string) => {
    setScenarioDataset(ds as unknown as EcoDataset)
    setScenarioLabel(label)
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
