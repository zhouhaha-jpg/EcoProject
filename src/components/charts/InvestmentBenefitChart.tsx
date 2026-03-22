import { useMemo, useRef } from 'react'
import type { InvestmentPlanResult } from '@/types'
import { useEChart } from './useEChart'

export default function InvestmentBenefitChart({ plan }: { plan: InvestmentPlanResult }) {
  const containerRef = useRef<HTMLDivElement>(null)

  const option = useMemo(() => ({
    grid: { top: 24, right: 18, bottom: 42, left: 54 },
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      backgroundColor: 'rgba(7,12,20,0.95)',
      borderColor: '#1e3256',
      textStyle: { color: '#e8f4ff', fontSize: 11 },
    },
    legend: {
      data: ['扩容前', '扩容后'],
      top: 0,
      textStyle: { color: '#8ba9cc', fontSize: 10 },
    },
    xAxis: {
      type: 'category' as const,
      data: ['年成本', '年碳排', '日发电量'],
      axisLine: { lineStyle: { color: '#1e3256' } },
      axisLabel: { color: '#5a7a9a', fontSize: 10 },
    },
    yAxis: {
      type: 'value' as const,
      axisLine: { lineStyle: { color: '#1e3256' } },
      axisLabel: { color: '#5a7a9a', fontSize: 10 },
      splitLine: { lineStyle: { color: '#111b2e', type: 'dashed' as const } },
    },
    series: [
      {
        name: '扩容前',
        type: 'bar' as const,
        barGap: '20%',
        barMaxWidth: 18,
        data: [
          plan.beforeAfter.annualCost.before,
          plan.beforeAfter.annualCarbon.before,
          plan.beforeAfter.dailyGeneration.before,
        ],
        itemStyle: {
          borderRadius: [8, 8, 2, 2],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#89b9ff' },
              { offset: 1, color: '#3d7bff' },
            ],
          },
        },
      },
      {
        name: '扩容后',
        type: 'bar' as const,
        barMaxWidth: 18,
        data: [
          plan.beforeAfter.annualCost.after,
          plan.beforeAfter.annualCarbon.after,
          plan.beforeAfter.dailyGeneration.after,
        ],
        itemStyle: {
          borderRadius: [8, 8, 2, 2],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#8ef9c4' },
              { offset: 1, color: '#28d48f' },
            ],
          },
        },
      },
    ],
  }), [plan])

  useEChart(containerRef, option, [plan])
  return <div ref={containerRef} className="h-full w-full min-h-[220px]" />
}
