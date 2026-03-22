import { useMemo, useRef } from 'react'
import { useEChart } from './useEChart'
import type { EmergencyDetailSeries } from '@/types'

interface EmergencyDeltaChartProps {
  detail: EmergencyDetailSeries
}

const SERIES_META = [
  { key: 'P_G', name: '电网', color: '#ce93d8', floor: 500 },
  { key: 'P_PV', name: '光伏', color: '#c6f135', floor: 180 },
  { key: 'P_CA', name: '电解槽', color: '#4e9eff', floor: 1200 },
  { key: 'P_GM', name: '燃机', color: '#ffb347', floor: 220 },
  { key: 'P_PEM', name: 'PEM', color: '#29d4ff', floor: 140 },
  { key: 'P_es_es', name: '储能', color: '#ffd740', floor: 140 },
] as const

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function EmergencyDeltaChart({ detail }: EmergencyDeltaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const option = useMemo(() => {
    const stageAreas = (detail.stagePlan || []).map((stage) => ([
      {
        xAxis: detail.labels[stage.startIndex || 0],
        itemStyle: { color: 'rgba(0,212,255,0.035)' },
      },
      {
        xAxis: detail.labels[Math.min(stage.endIndex || detail.labels.length - 1, detail.labels.length - 1)],
      },
    ]))

    return {
      backgroundColor: 'transparent',
      animationDuration: 240,
      grid: { top: 26, right: 18, bottom: 32, left: 52 },
      legend: {
        top: 0,
        itemWidth: 10,
        itemHeight: 6,
        textStyle: {
          color: '#8ba9cc',
          fontSize: 10,
          fontFamily: "'Share Tech Mono', monospace",
        },
        data: SERIES_META.map((item) => item.name),
      },
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'cross' as const },
        backgroundColor: 'rgba(7,12,20,0.96)',
        borderColor: '#1e3256',
        textStyle: {
          color: '#e8f4ff',
          fontSize: 11,
          fontFamily: "'Share Tech Mono', monospace",
        },
        formatter: (params: Array<{ seriesName: string; value: number }>) => {
          const lines = params.map((item) => `${item.seriesName}: ${item.value.toFixed(1)}%`)
          return lines.join('<br/>')
        },
      },
      xAxis: {
        type: 'category' as const,
        data: detail.labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#5a7a9a',
          fontSize: 9,
          interval: 7,
          fontFamily: "'Share Tech Mono', monospace",
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#5a7a9a',
          fontSize: 9,
          formatter: (value: number) => `${value.toFixed(0)}%`,
          fontFamily: "'Share Tech Mono', monospace",
        },
        splitLine: { lineStyle: { color: '#111b2e', type: 'dashed' as const } },
      },
      series: SERIES_META.map(({ key, name, color, floor }, index) => ({
        name,
        type: 'line' as const,
        smooth: 0.22,
        symbol: 'none',
        z: 2 + index,
        data: detail.series[key].map((value, dataIndex) => {
          const base = detail.baselineSeries?.[key]?.[dataIndex] ?? 0
          const denominator = Math.max(Math.abs(base), floor)
          return ((value - base) / denominator) * 100
        }),
        lineStyle: {
          width: 1.8,
          color,
          shadowBlur: 10,
          shadowColor: hexToRgba(color, 0.22),
        },
        itemStyle: { color },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: hexToRgba(color, 0.16) },
              { offset: 1, color: hexToRgba(color, 0.01) },
            ],
          },
        },
        markLine: index === 0
          ? {
              silent: true,
              symbol: 'none',
              lineStyle: { color: 'rgba(90,122,154,0.55)', type: 'dashed' as const },
              data: [{ yAxis: 0 }],
            }
          : undefined,
        markArea: index === 0 && stageAreas.length
          ? {
              silent: true,
              label: {
                color: '#3d6080',
                fontSize: 9,
              },
              data: stageAreas,
            }
          : undefined,
      })),
    }
  }, [detail])

  useEChart(containerRef, option, [detail])
  return <div ref={containerRef} className="h-full min-h-[150px] w-full" />
}
