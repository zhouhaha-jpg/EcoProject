import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { StrategyContextValue, StrategyKey } from '@/types'
import { DATASET, STRATEGY_META } from '@/data/realData'

const StrategyContext = createContext<StrategyContextValue | null>(null)

export function StrategyProvider({ children }: { children: ReactNode }) {
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>('uci')
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <StrategyContext.Provider value={{
      activeStrategy, setActiveStrategy,
      dataset: DATASET,
      strategyMeta: STRATEGY_META,
      currentTime,
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
