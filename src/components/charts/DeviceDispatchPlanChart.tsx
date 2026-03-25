import { useMemo, useRef } from 'react'
import { getHours } from '@/data/realData'
import type { EcoDataset, StrategyKey } from '@/types'
import { useEChart } from './useEChart'

interface DeviceDispatchPlanChartProps {
  dataset: EcoDataset
  strategy: StrategyKey
}

const COLORS = {
  P_CA: '#4e9eff',
  P_PV: '#c6f135',
  P_GM: '#ffb347',
  P_PEM: '#29d4ff',
  P_G: '#ce93d8',
  P_es_es: '#ffd740',
}

export default function DeviceDispatchPlanChart({ dataset, strategy }: DeviceDispatchPlanChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hours = getHours()

  const option = useMemo(() => ({
    grid: { top: 44, right: 18, bottom: 36, left: 56 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0A1628',
      borderColor: '#00F3FF33',
      textStyle: { color: '#8BA9CC', fontSize: 11 },
    },
    legend: {
      top: 8,
      textStyle: { color: '#8BA9CC', fontSize: 10 },
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 4,
    },
    xAxis: {
      type: 'category',
      data: hours,
      axisLine: { lineStyle: { color: '#1A3350' } },
      axisLabel: { color: '#5A7A9A', fontSize: 10, formatter: (value: string) => `${value}h` },
    },
    yAxis: {
      type: 'value',
      name: 'kW',
      nameTextStyle: { color: '#5A7A9A', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1A3350', type: 'dashed' } },
      axisLabel: { color: '#5A7A9A', fontSize: 10 },
    },
    series: [
      { name: '电解槽', type: 'line', smooth: true, symbol: 'none', lineStyle: { color: COLORS.P_CA, width: 2 }, data: dataset.P_CA[strategy] },
      { name: '光伏', type: 'line', smooth: true, symbol: 'none', lineStyle: { color: COLORS.P_PV, width: 2 }, data: dataset.P_PV[strategy] },
      { name: '燃机', type: 'line', smooth: true, symbol: 'none', lineStyle: { color: COLORS.P_GM, width: 2 }, data: dataset.P_GM[strategy] },
      { name: 'PEM', type: 'line', smooth: true, symbol: 'none', lineStyle: { color: COLORS.P_PEM, width: 2 }, data: dataset.P_PEM[strategy] },
      { name: '购电', type: 'line', smooth: true, symbol: 'none', lineStyle: { color: COLORS.P_G, width: 2 }, data: dataset.P_G[strategy] },
      { name: '储能', type: 'line', smooth: true, symbol: 'none', lineStyle: { color: COLORS.P_es_es, width: 2 }, data: dataset.P_es_es },
    ],
  }), [dataset, hours, strategy])

  useEChart(containerRef, option, [dataset, strategy])

  return <div ref={containerRef} className="w-full h-full" />
}
