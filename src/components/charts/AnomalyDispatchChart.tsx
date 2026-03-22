import { useMemo, useRef } from 'react'
import type { AnomalyDispatchDetail } from '@/types'
import { useEChart } from './useEChart'

const COLORS = {
  indicator: '#ff7b72',
  threshold: '#ffd166',
  P_CA: '#4e9eff',
  P_PV: '#c6f135',
  P_GM: '#ffb347',
  P_PEM: '#29d4ff',
  P_G: '#ce93d8',
  P_es_es: '#ffd740',
}

export default function AnomalyDispatchChart({ detail }: { detail: AnomalyDispatchDetail }) {
  const containerRef = useRef<HTMLDivElement>(null)

  const option = useMemo(() => ({
    legend: {
      top: 0,
      textStyle: { color: '#8ba9cc', fontSize: 10 },
      data: ['异常指标', '阈值', '电解槽', '光伏', '燃机', 'PEM', '电网', '储能'],
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(7,12,20,0.95)',
      borderColor: '#1e3256',
      textStyle: { color: '#e8f4ff', fontSize: 11 },
    },
    grid: [
      { top: 28, right: 18, left: 52, height: '28%' },
      { top: '46%', right: 18, left: 52, bottom: 32 },
    ],
    xAxis: [
      {
        type: 'category' as const,
        data: detail.labels,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: { color: '#5a7a9a', fontSize: 10 },
        splitLine: { show: false },
      },
      {
        type: 'category' as const,
        gridIndex: 1,
        data: detail.labels,
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
        lineStyle: { width: 3, color: COLORS.indicator },
        itemStyle: { color: COLORS.indicator },
      },
      {
        name: '阈值',
        type: 'line' as const,
        smooth: true,
        symbol: 'none',
        data: detail.indicatorSeries.map((item) => item.threshold),
        lineStyle: { width: 1.5, type: 'dashed' as const, color: COLORS.threshold },
      },
      ...([
        ['P_CA', '电解槽'],
        ['P_PV', '光伏'],
        ['P_GM', '燃机'],
        ['P_PEM', 'PEM'],
        ['P_G', '电网'],
        ['P_es_es', '储能'],
      ] as const).map(([key, name]) => ({
        name,
        type: 'line' as const,
        xAxisIndex: 1,
        yAxisIndex: 1,
        smooth: true,
        symbol: 'none',
        data: detail.series[key],
        lineStyle: { width: 2.5, color: COLORS[key] },
        areaStyle: key === 'P_G' || key === 'P_CA'
          ? {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: `${COLORS[key]}2f` },
                  { offset: 1, color: `${COLORS[key]}03` },
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
