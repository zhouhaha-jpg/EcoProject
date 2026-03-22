import { useMemo, useRef } from 'react'
import type { InvestmentPlanResult } from '@/types'
import { useEChart } from './useEChart'

export default function InvestmentCashflowChart({ plan }: { plan: InvestmentPlanResult }) {
  const containerRef = useRef<HTMLDivElement>(null)

  const option = useMemo(() => ({
    grid: { top: 28, right: 18, bottom: 36, left: 52 },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(7,12,20,0.95)',
      borderColor: '#1e3256',
      textStyle: { color: '#e8f4ff', fontSize: 11 },
    },
    legend: {
      data: ['累计现金流', '年度净现金流'],
      top: 0,
      textStyle: { color: '#8ba9cc', fontSize: 10 },
    },
    xAxis: {
      type: 'category' as const,
      data: plan.yearlyCashflow.map((item) => `${item.year}`),
      axisLine: { lineStyle: { color: '#1e3256' } },
      axisLabel: { color: '#5a7a9a', fontSize: 10 },
    },
    yAxis: [
      {
        type: 'value' as const,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: { color: '#5a7a9a', fontSize: 10, formatter: (value: number) => `${Math.round(value / 10000)}w` },
        splitLine: { lineStyle: { color: '#111b2e', type: 'dashed' as const } },
      },
    ],
    series: [
      {
        name: '累计现金流',
        type: 'line' as const,
        smooth: true,
        data: plan.yearlyCashflow.map((item) => item.cumulativeCashflow),
        symbolSize: 7,
        lineStyle: { width: 3, color: '#00d4ff' },
        itemStyle: { color: '#00d4ff', borderColor: '#8ef9ff', borderWidth: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0,212,255,0.32)' },
              { offset: 1, color: 'rgba(0,212,255,0.02)' },
            ],
          },
        },
      },
      {
        name: '年度净现金流',
        type: 'bar' as const,
        barMaxWidth: 18,
        data: plan.yearlyCashflow.map((item) => item.netCashflow),
        itemStyle: {
          borderRadius: [8, 8, 2, 2],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#ffe88a' },
              { offset: 1, color: '#ffc72c' },
            ],
          },
        },
      },
    ],
  }), [plan])

  useEChart(containerRef, option, [plan])
  return <div ref={containerRef} className="h-full w-full min-h-[220px]" />
}
