import { useStrategy } from '@/context/StrategyContext'
import type { StrategyKey } from '@/types'

export default function StrategySwitcher() {
  const { activeStrategy, setActiveStrategy, strategyMeta } = useStrategy()

  return (
    <div className="flex items-center gap-1">
      {(Object.keys(strategyMeta) as StrategyKey[]).map((key) => {
        const meta = strategyMeta[key]
        const active = key === activeStrategy
        return (
          <button
            key={key}
            onClick={() => setActiveStrategy(key)}
            className={`strategy-btn ${active ? 'active' : ''}`}
            style={active ? { borderColor: meta.color, color: meta.color, background: `${meta.color}10` } : undefined}
            title={meta.description}
          >
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}
