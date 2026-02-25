import { useRef, useMemo } from 'react'
import { useStrategy } from '@/context/StrategyContext'
import { useEChart } from './useEChart'
import type { StrategyKey } from '@/types'

const ALL_STRATEGIES: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']

export default function WaterfallChart({ metric = 'cost' }: { metric?: 'cost' | 'carbon' | 'combined' }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { activeStrategy, dataset, strategyMeta } = useStrategy()

  const LABEL: Record<string, string> = {
    cost: '运营成本 (¥)',
    carbon: '碳排放量 (tCO₂)',
    combined: '综合目标值',
  }

  const option = useMemo(() => {
    const values = ALL_STRATEGIES.map(sk => dataset.summary[sk][metric])
    const colors = ALL_STRATEGIES.map(sk => strategyMeta[sk].color)
    const borderColors = ALL_STRATEGIES.map(sk => activeStrategy === sk ? '#fff' : strategyMeta[sk].color)

    return {
      grid: { top: 20, right: 16, bottom: 52, left: 66 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0A1628',
        borderColor: '#00F3FF33',
        textStyle: { color: '#8BA9CC', fontSize: 11 },
        formatter: (p: unknown[]) => {
          const x = (p as Array<{name: string; value: number; color: string}>)[0]
          return `${x.name}<br/><span style="color:${x.color}">●</span> ${LABEL[metric]}: <b>${x.value.toLocaleString()}</b>`
        },
      },
      xAxis: {
        type: 'category',
        data: ALL_STRATEGIES.map(sk => strategyMeta[sk].label),
        axisLine: { lineStyle: { color: '#1A3350' } },
        axisLabel: { color: '#8BA9CC', fontSize: 11 },
      },
      yAxis: {
        type: 'value', name: LABEL[metric].split(' ')[1] ?? '',
        nameTextStyle: { color: '#5A7A9A', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1A3350', type: 'dashed' } },
        axisLabel: { color: '#5A7A9A', fontSize: 10 },
        scale: true,
      },
      series: [{
        type: 'bar',
        data: values.map((v, i) => ({
          value: v,
          itemStyle: {
            color: colors[i] + 'CC',
            borderColor: borderColors[i],
            borderWidth: ALL_STRATEGIES[i] === activeStrategy ? 2 : 0,
          },
        })),
        barMaxWidth: 40,
        label: {
          show: true, position: 'top',
          formatter: (p: { value: number }) => metric === 'combined' ? p.value.toFixed(2) : Math.round(p.value).toLocaleString(),
          color: '#8BA9CC', fontSize: 10,
        },
      }],
    }
  }, [activeStrategy, dataset, strategyMeta, metric])

  useEChart(containerRef, option, [activeStrategy, metric])

  return <div ref={containerRef} className="w-full h-full" />
}
