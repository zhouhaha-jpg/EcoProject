import { useMemo, useRef } from 'react'
import { getHours } from '@/data/realData'
import type { EcoDataset, StrategyKey } from '@/types'
import { useEChart } from './useEChart'

interface DeviceDispatchPlanChartProps {
  dataset: EcoDataset
  strategy: StrategyKey
}

const SERIES_META = [
  { key: 'P_CA', name: '电解槽', color: '#4e9eff' },
  { key: 'P_PV', name: '光伏', color: '#c6f135' },
  { key: 'P_GM', name: '燃机', color: '#ffb347' },
  { key: 'P_PEM', name: 'PEM', color: '#29d4ff' },
  { key: 'P_G', name: '购电', color: '#ce93d8' },
  { key: 'P_es_es', name: '储能', color: '#ffd740' },
] as const

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function computeExtent(dataset: EcoDataset, strategy: StrategyKey) {
  let minValue = Number.POSITIVE_INFINITY
  let maxValue = Number.NEGATIVE_INFINITY

  SERIES_META.forEach(({ key }) => {
    const values = key === 'P_es_es' ? dataset.P_es_es : dataset[key][strategy]
    values.forEach((value) => {
      if (!Number.isFinite(value)) return
      minValue = Math.min(minValue, value)
      maxValue = Math.max(maxValue, value)
    })
  })

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return { min: 0, max: 100 }
  }

  const span = maxValue - minValue
  const padding = span > 1 ? span * 0.14 : Math.max(Math.abs(maxValue) * 0.18, 40)

  return {
    min: Math.floor((minValue - padding * 0.4) / 10) * 10,
    max: Math.ceil((maxValue + padding) / 10) * 10,
  }
}

export default function DeviceDispatchPlanChart({ dataset, strategy }: DeviceDispatchPlanChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hours = getHours()

  const option = useMemo(() => {
    const extent = computeExtent(dataset, strategy)
    const peakValue = Math.max(
      ...SERIES_META.flatMap(({ key }) => (key === 'P_es_es' ? dataset.P_es_es : dataset[key][strategy])),
      0,
    )
    const glowBase = Math.max(peakValue * 0.08, 60)

    return {
      backgroundColor: 'transparent',
      animationDuration: 260,
      grid: { top: 54, right: 18, bottom: 40, left: 56 },
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: {
          type: 'cross' as const,
          lineStyle: { color: 'rgba(0,212,255,0.5)', width: 1 },
          crossStyle: { color: 'rgba(0,212,255,0.4)' },
          label: {
            backgroundColor: 'rgba(0,212,255,0.18)',
            color: '#e8f4ff',
            fontFamily: "'Share Tech Mono', monospace",
          },
        },
        backgroundColor: 'rgba(7,12,20,0.96)',
        borderColor: '#1e3256',
        textStyle: {
          color: '#e8f4ff',
          fontSize: 11,
          fontFamily: "'Share Tech Mono', monospace",
        },
      },
      legend: {
        top: 8,
        itemWidth: 12,
        itemHeight: 8,
        icon: 'roundRect',
        inactiveColor: '#41556f',
        textStyle: {
          color: '#8ba9cc',
          fontSize: 10,
          fontFamily: "'Share Tech Mono', monospace",
        },
        data: SERIES_META.map((item) => item.name),
      },
      xAxis: {
        type: 'category' as const,
        data: hours,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#5a7a9a',
          fontSize: 10,
          fontFamily: "'Share Tech Mono', monospace",
          formatter: (value: string) => `${value}h`,
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        scale: true,
        min: extent.min,
        max: extent.max,
        name: 'kW',
        nameTextStyle: {
          color: '#5a7a9a',
          fontSize: 10,
          fontFamily: "'Share Tech Mono', monospace",
          padding: [0, 0, 0, -6],
        },
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#5a7a9a',
          fontSize: 10,
          fontFamily: "'Share Tech Mono', monospace",
        },
        splitLine: { lineStyle: { color: '#1a3350', type: 'dashed' as const } },
      },
      series: [
        {
          name: '__glow__',
          type: 'line' as const,
          data: hours.map(() => glowBase),
          symbol: 'none',
          silent: true,
          z: 0,
          lineStyle: { opacity: 0, width: 0 },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0,212,255,0.12)' },
                { offset: 1, color: 'rgba(0,212,255,0)' },
              ],
            },
          },
          tooltip: { show: false },
        },
        ...SERIES_META.map(({ key, name, color }) => ({
          name,
          type: 'line' as const,
          data: key === 'P_es_es' ? dataset.P_es_es : dataset[key][strategy],
          smooth: 0.28,
          symbol: 'none',
          z: 2,
          lineStyle: {
            width: 2.3,
            color,
            shadowBlur: 8,
            shadowColor: hexToRgba(color, 0.28),
          },
          itemStyle: { color },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: hexToRgba(color, 0.18) },
                { offset: 0.45, color: hexToRgba(color, 0.08) },
                { offset: 1, color: hexToRgba(color, 0.01) },
              ],
            },
          },
          emphasis: {
            focus: 'series' as const,
            lineStyle: {
              width: 3.6,
              opacity: 1,
              shadowBlur: 18,
              shadowColor: hexToRgba(color, 0.45),
            },
            areaStyle: { opacity: 0.32 },
          },
          blur: {
            lineStyle: { opacity: 0.18 },
            areaStyle: { opacity: 0.04 },
          },
        })),
      ],
    }
  }, [dataset, hours, strategy])

  useEChart(containerRef, option, [dataset, strategy])

  return <div ref={containerRef} className="h-full w-full" />
}
