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
            className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.14em] rounded-sm transition-all duration-200 border ${
              active
                ? 'text-cyber-black font-bold'
                : 'border-border-cyber text-text-muted hover:text-text-primary'
            }`}
            style={active ? { backgroundColor: meta.color, borderColor: meta.color, boxShadow: `0 0 12px ${meta.color}88` } : { borderColor: meta.color + '44', color: meta.color }}
            title={meta.description}
          >
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}
