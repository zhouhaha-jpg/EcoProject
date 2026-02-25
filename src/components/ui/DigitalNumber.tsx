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

export default function DigitalNumber({ value, unit, label, color = '#00d4ff', size = 'md', decimals }: DigitalNumberProps) {
  const display = typeof value === 'number' && decimals !== undefined
    ? value.toFixed(decimals)
    : value

  return (
    <div className="flex flex-col items-start gap-0.5">
      {label && <span style={{ fontSize: 10, color: '#3d6080', fontFamily: "'Share Tech Mono', monospace", letterSpacing: 1 }}>{label}</span>}
      <div className="flex items-baseline gap-1">
        <span
          className={`font-bold ${sizeMap[size]}`}
          style={{ color, fontFamily: "'Rajdhani', sans-serif" }}
        >
          {display}
        </span>
        {unit && <span style={{ fontSize: 11, color: '#8ba9cc' }}>{unit}</span>}
      </div>
    </div>
  )
}
