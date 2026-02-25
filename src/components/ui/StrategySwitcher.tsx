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
            className={`strategy-tab px-3 py-1.5 text-xs font-mono uppercase tracking-wider rounded transition-all duration-200 border ${
              active
                ? 'text-cyber-black font-bold'
                : 'border-border-cyber text-text-muted hover:text-text-primary hover:border-current'
            }`}
            style={active ? { backgroundColor: meta.color, borderColor: meta.color, boxShadow: `0 0 12px ${meta.color}88` } : { borderColor: meta.color + '44', color: meta.color }}
            title={meta.description}
          >
            {meta.shortLabel}
          </button>
        )
      })}
    </div>
  )
}
