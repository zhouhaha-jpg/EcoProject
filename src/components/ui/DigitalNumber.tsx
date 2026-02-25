interface DigitalNumberProps {
  value: number | string
  unit?: string
  label?: string
  color?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  decimals?: number
}

const sizeMap = {
  sm:  'text-lg',
  md:  'text-2xl',
  lg:  'text-4xl',
  xl:  'text-5xl',
}

export default function DigitalNumber({ value, unit, label, color = '#00F3FF', size = 'md', decimals }: DigitalNumberProps) {
  const display = typeof value === 'number' && decimals !== undefined
    ? value.toFixed(decimals)
    : value

  return (
    <div className="flex flex-col items-start gap-0.5">
      {label && <span className="text-xs tracking-widest uppercase text-text-muted font-body">{label}</span>}
      <div className="flex items-baseline gap-1">
        <span
          className={`font-mono font-bold ${sizeMap[size]}`}
          style={{ color, textShadow: `0 0 12px ${color}66` }}
        >
          {display}
        </span>
        {unit && <span className="text-xs text-text-muted font-body">{unit}</span>}
      </div>
    </div>
  )
}
