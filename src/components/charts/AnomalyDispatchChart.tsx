import { useMemo, useRef } from 'react'
import type { AnomalyDispatchDetail } from '@/types'
import { useEChart } from './useEChart'

const SERIES_META = [
  { key: 'indicator', name: '异常指标', color: '#ff7b72' },
  { key: 'threshold', name: '阈值', color: '#ffd166' },
  { key: 'P_CA', name: '电解槽', color: '#4e9eff' },
  { key: 'P_PV', name: '光伏', color: '#c6f135' },
  { key: 'P_GM', name: '燃机', color: '#ffb347' },
  { key: 'P_PEM', name: 'PEM', color: '#29d4ff' },
  { key: 'P_G', name: '电网', color: '#ce93d8' },
  { key: 'P_es_es', name: '储能', color: '#ffd740' },
] as const

export default function AnomalyDispatchChart({ detail }: { detail: AnomalyDispatchDetail }) {
  const containerRef = useRef<HTMLDivElement>(null)

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    color: SERIES_META.map((item) => item.color),
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(7,12,20,0.95)',
      borderColor: '#1e3256',
      textStyle: { color: '#e8f4ff', fontSize: 11 },
    },
    legend: {
      top: 0,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: {
        color: '#8ba9cc',
        fontSize: 10,
        fontFamily: "'Share Tech Mono', monospace",
      },
      data: SERIES_META.map((item) => item.name),
    },
    grid: [
      { top: 32, right: 18, left: 52, height: '28%' },
      { top: '46%', right: 18, left: 52, bottom: 32 },
    ],
    xAxis: [
      {
        type: 'category' as const,
        data: detail.labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: { color: '#5a7a9a', fontSize: 10 },
        splitLine: { show: false },
      },
      {
        type: 'category' as const,
        gridIndex: 1,
        data: detail.labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: { color: '#5a7a9a', fontSize: 10 },
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        type: 'value' as const,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: { color: '#5a7a9a', fontSize: 10 },
        splitLine: { lineStyle: { color: '#111b2e', type: 'dashed' as const } },
      },
      {
        type: 'value' as const,
        gridIndex: 1,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: { color: '#5a7a9a', fontSize: 10 },
        splitLine: { lineStyle: { color: '#111b2e', type: 'dashed' as const } },
      },
    ],
    series: [
      {
        name: '异常指标',
        type: 'line' as const,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: detail.indicatorSeries.map((item) => item.value),
        lineStyle: { width: 3, color: '#ff7b72' },
        itemStyle: { color: '#ff7b72', borderColor: '#ff7b72' },
      },
      {
        name: '阈值',
        type: 'line' as const,
        smooth: true,
        symbol: 'none',
        data: detail.indicatorSeries.map((item) => item.threshold),
        lineStyle: { width: 1.5, type: 'dashed' as const, color: '#ffd166' },
        itemStyle: { color: '#ffd166', borderColor: '#ffd166' },
      },
      ...([
        ['P_CA', '电解槽', '#4e9eff'],
        ['P_PV', '光伏', '#c6f135'],
        ['P_GM', '燃机', '#ffb347'],
        ['P_PEM', 'PEM', '#29d4ff'],
        ['P_G', '电网', '#ce93d8'],
        ['P_es_es', '储能', '#ffd740'],
      ] as const).map(([key, name, color]) => ({
        name,
        type: 'line' as const,
        xAxisIndex: 1,
        yAxisIndex: 1,
        smooth: true,
        symbol: 'none',
        data: detail.series[key],
        lineStyle: { width: 2.5, color },
        itemStyle: { color, borderColor: color },
        areaStyle: key === 'P_G' || key === 'P_CA'
          ? {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: `${color}2f` },
                  { offset: 1, color: `${color}03` },
                ],
              },
            }
          : undefined,
      })),
    ],
  }), [detail])

  useEChart(containerRef, option, [detail])
  return <div ref={containerRef} className="h-full w-full min-h-[320px]" />
}
