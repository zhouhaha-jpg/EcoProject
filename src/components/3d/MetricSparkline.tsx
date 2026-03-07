import { useId, useMemo } from 'react'

interface MetricSparklineProps {
  values: number[]
  stroke?: string
  fill?: string
  width?: number
  height?: number
  highlightIndex?: number
  emphasized?: boolean
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function normalizeRange(values: number[]) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 1)
  const ratio = range / maxAbs

  if (range <= 1e-6) {
    const padding = Math.max(maxAbs * 0.03, 1)
    return {
      min: values[0] - padding,
      max: values[0] + padding,
      isFlat: true,
      isLowVariation: true,
    }
  }

  if (ratio < 0.04) {
    const center = (max + min) / 2
    const halfWindow = Math.max(range * 1.8, maxAbs * 0.025, 1)
    return {
      min: center - halfWindow,
      max: center + halfWindow,
      isFlat: false,
      isLowVariation: true,
    }
  }

  return {
    min,
    max,
    isFlat: false,
    isLowVariation: false,
  }
}

export default function MetricSparkline({
  values,
  stroke = '#00d4ff',
  fill,
  width = 260,
  height = 96,
  highlightIndex,
  emphasized = false,
}: MetricSparklineProps) {
  const uid = useId().replace(/:/g, '')
  const rangeMeta = useMemo(() => (values.length ? normalizeRange(values) : null), [values])
  const points = useMemo(() => {
    if (!values.length) return [] as Array<{ x: number; y: number }>

    const min = rangeMeta?.min ?? 0
    const max = rangeMeta?.max ?? 1
    const range = Math.max(max - min, 1e-6)

    return values.map((value, index) => ({
      x: (index / Math.max(values.length - 1, 1)) * width,
      y: height - (((value - min) / range) * (height - 16)) - 8,
    }))
  }, [height, rangeMeta, values, width])

  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  const areaPath = points.length
    ? `${linePath} L ${width} ${height} L 0 ${height} Z`
    : ''
  const highlightPoint = highlightIndex != null ? points[highlightIndex] : undefined
  const baseFill = fill ?? hexToRgba(stroke, emphasized ? 0.24 : 0.15)
  const glowColor = hexToRgba(stroke, rangeMeta?.isLowVariation ? 0.52 : emphasized ? 0.48 : 0.28)
  const lineGradientId = `spark-line-${uid}`
  const fillGradientId = `spark-fill-${uid}`
  const glowFilterId = `spark-glow-${uid}`
  const clipPathId = `spark-clip-${uid}`
  const scanGradientId = `spark-scan-${uid}`
  const pulseOpacity = rangeMeta?.isLowVariation ? 0.34 : emphasized ? 0.28 : 0.2
  const glowStrokeWidth = rangeMeta?.isLowVariation ? (emphasized ? 7 : 5.6) : emphasized ? 6 : 4.5
  const lineStrokeWidth = rangeMeta?.isLowVariation ? (emphasized ? 3.4 : 2.8) : emphasized ? 2.8 : 2.4

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={baseFill} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
        <linearGradient id={lineGradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={hexToRgba(stroke, 0.78)} />
          <stop offset="55%" stopColor={stroke} />
          <stop offset="100%" stopColor={hexToRgba(stroke, 0.72)} />
        </linearGradient>
        <filter id={glowFilterId} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation={rangeMeta?.isLowVariation ? 4.4 : emphasized ? 4 : 2.8} floodColor={glowColor}>
            <animate attributeName="flood-opacity" values={`${pulseOpacity};${Math.min(pulseOpacity + 0.16, 0.62)};${pulseOpacity}`} dur="2.8s" repeatCount="indefinite" />
          </feDropShadow>
        </filter>
        <linearGradient id={scanGradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="50%" stopColor={hexToRgba(stroke, emphasized ? 0.42 : 0.26)} />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <clipPath id={clipPathId}>
          <rect x="0" y="0" width={width} height={height} rx="0" ry="0" />
        </clipPath>
      </defs>
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line
          key={ratio}
          x1={0}
          y1={height * ratio}
          x2={width}
          y2={height * ratio}
          stroke="rgba(61,96,128,0.28)"
          strokeDasharray="4 4"
          strokeWidth="1"
        />
      ))}
      {areaPath && <path d={areaPath} fill={`url(#${fillGradientId})`} />}
      <g clipPath={`url(#${clipPathId})`}>
        <rect x={-width * 0.3} y="0" width={width * 0.26} height={height} fill={`url(#${scanGradientId})`} opacity={emphasized ? 0.14 : 0.08}>
          <animateTransform attributeName="transform" type="translate" from={`${-width * 0.9} 0`} to={`${width * 1.55} 0`} dur={emphasized ? '2.6s' : '3.4s'} repeatCount="indefinite" />
        </rect>
      </g>
      {linePath && (
        <>
          <path
            d={linePath}
            fill="none"
            stroke={hexToRgba(stroke, rangeMeta?.isLowVariation ? 0.26 : emphasized ? 0.24 : 0.14)}
            strokeWidth={glowStrokeWidth.toString()}
            strokeLinejoin="round"
            strokeLinecap="round"
            filter={`url(#${glowFilterId})`}
            opacity="0.95"
          />
          <path
            d={linePath}
            fill="none"
            stroke={`url(#${lineGradientId})`}
            strokeWidth={lineStrokeWidth.toString()}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
      {highlightPoint && (
        <>
          <circle cx={highlightPoint.x} cy={highlightPoint.y} r={emphasized ? '7' : '5'} fill={hexToRgba(stroke, emphasized ? 0.22 : 0.15)} filter={`url(#${glowFilterId})`} />
          <circle cx={highlightPoint.x} cy={highlightPoint.y} r="2.8" fill={stroke} />
        </>
      )}
    </svg>
  )
}