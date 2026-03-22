import { useStrategy } from '@/context/StrategyContext'
import type { StrategyKey } from '@/types'

export default function StrategySwitcher() {
  const { selectedStrategies, toggleStrategy, strategyMeta, datasetMeta } = useStrategy()

  if (datasetMeta?.emergencyActive && datasetMeta?.emergencyMode === 'single') {
    return (
      <div className="rounded border border-[#ff7043]/50 bg-[#ff7043]/10 px-3 py-1.5 text-[11px] tracking-[0.16em] text-[#ffb199]">
        EMERGENCY SINGLE MODE
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      {(Object.keys(strategyMeta) as StrategyKey[]).map((key) => {
        const meta = strategyMeta[key]
        const selected = selectedStrategies.has(key)
        return (
          <button
            key={key}
            onClick={() => toggleStrategy(key)}
            className={`strategy-btn ${selected ? 'active' : ''}`}
            style={selected ? { borderColor: meta.color, color: meta.color, background: `${meta.color}22` } : { opacity: 0.35 }}
            title={`${meta.description}（点击切换曲线高亮）`}
          >
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}
