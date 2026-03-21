import { useEffect, useMemo, useRef } from 'react'
import { useEChart } from './useEChart'
import type { EmergencyDetailSeries, EmergencyPointDetail } from '@/types'

interface EmergencyDispatchChartProps {
  detail: EmergencyDetailSeries
  onPointHover?: (point: EmergencyPointDetail) => void
}

const COLORS = {
  P_CA: '#4e9eff',
  P_PV: '#c6f135',
  P_GM: '#ffb347',
  P_PEM: '#29d4ff',
  P_G: '#ce93d8',
  P_es_es: '#ffd740',
}

export default function EmergencyDispatchChart({ detail, onPointHover }: EmergencyDispatchChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const option = useMemo(() => ({
    grid: { top: 24, right: 18, bottom: 42, left: 52 },
    legend: {
      top: 0,
      textStyle: { color: '#8ba9cc', fontSize: 10 },
      itemWidth: 12,
      itemHeight: 8,
      data: ['电解槽', '光伏', '燃机', 'PEM', '电网', '储能'],
    },
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'cross' as const },
      backgroundColor: 'rgba(7,12,20,0.96)',
      borderColor: '#1e3256',
      textStyle: { color: '#e8f4ff', fontSize: 11 },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const point = detail.points[params?.[0]?.dataIndex ?? 0]
        if (!point) return ''
        return [
          `<div style="font-family:Rajdhani,sans-serif;font-size:12px;color:#00d4ff;margin-bottom:4px">${point.label}</div>`,
          `电解槽: ${point.P_CA.toFixed(0)} kW`,
          `光伏: ${point.P_PV.toFixed(0)} kW`,
          `燃机: ${point.P_GM.toFixed(0)} kW`,
          `PEM: ${point.P_PEM.toFixed(0)} kW`,
          `电网: ${point.P_G.toFixed(0)} kW`,
          `储能: ${point.P_es_es.toFixed(0)} kW`,
          `缺口: <span style="color:${point.gap > 25 ? '#ff7043' : '#69f0ae'}">${point.gap.toFixed(1)} kW</span>`,
        ].join('<br/>')
      },
    },
    xAxis: {
      type: 'category' as const,
      data: detail.labels,
      axisLine: { lineStyle: { color: '#1e3256' } },
      axisLabel: { color: '#5a7a9a', fontSize: 9, interval: 5 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      axisLine: { lineStyle: { color: '#1e3256' } },
      axisLabel: { color: '#5a7a9a', fontSize: 9, formatter: (value: number) => `${value.toFixed(0)}` },
      splitLine: { lineStyle: { color: '#111b2e', type: 'dashed' as const } },
      axisTick: { show: false },
    },
    series: [
      { name: '电解槽', type: 'line' as const, data: detail.series.P_CA, smooth: true, symbol: 'none', lineStyle: { width: 2, color: COLORS.P_CA } },
      { name: '光伏', type: 'line' as const, data: detail.series.P_PV, smooth: true, symbol: 'none', lineStyle: { width: 2, color: COLORS.P_PV } },
      { name: '燃机', type: 'line' as const, data: detail.series.P_GM, smooth: true, symbol: 'none', lineStyle: { width: 2, color: COLORS.P_GM } },
      { name: 'PEM', type: 'line' as const, data: detail.series.P_PEM, smooth: true, symbol: 'none', lineStyle: { width: 2, color: COLORS.P_PEM } },
      { name: '电网', type: 'line' as const, data: detail.series.P_G, smooth: true, symbol: 'none', lineStyle: { width: 2, color: COLORS.P_G } },
      { name: '储能', type: 'line' as const, data: detail.series.P_es_es, smooth: true, symbol: 'none', lineStyle: { width: 2, color: COLORS.P_es_es } },
    ],
  }), [detail])

  const chartRef = useEChart(containerRef, option, [detail])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !onPointHover) return

    const emitPoint = (index: number) => {
      const point = detail.points[index]
      if (point) onPointHover(point)
    }

    emitPoint(0)
    const handler = (params: { dataIndex?: number }) => emitPoint(params.dataIndex ?? 0)
    chart.on('mousemove', 'series', handler)
    return () => {
      chart.off('mousemove', handler)
    }
  }, [chartRef, detail, onPointHover])

  return <div ref={containerRef} className="w-full h-full min-h-[280px]" />
}
