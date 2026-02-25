import { useRef, useMemo } from 'react'
import { useStrategy } from '@/context/StrategyContext'
import { useEChart } from './useEChart'
import { getHours } from '@/data/realData'

export default function HydrogenChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { activeStrategy, dataset, strategyMeta } = useStrategy()
  const hours = getHours()

  const option = useMemo(() => {
    const d = dataset[activeStrategy]
    const meta = strategyMeta[activeStrategy]
    const H_CA  = d.H_CA  as number[]
    const H_PEM = d.H_PEM as number[]
    const H_CH  = d.H_CH  as number[]
    const H_HS  = d.H_HS  as number[]

    return {
      grid: { top: 36, right: 16, bottom: 40, left: 60 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0A1628',
        borderColor: '#00F3FF33',
        textStyle: { color: '#8BA9CC', fontSize: 11 },
      },
      legend: {
        top: 4, textStyle: { color: '#8BA9CC', fontSize: 10 },
        icon: 'roundRect', itemWidth: 12, itemHeight: 4,
      },
      xAxis: {
        type: 'category', data: hours,
        axisLine: { lineStyle: { color: '#1A3350' } },
        axisLabel: { color: '#5A7A9A', fontSize: 10, formatter: (v: string) => `${v}h` },
      },
      yAxis: {
        type: 'value', name: 'kg/h', nameTextStyle: { color: '#5A7A9A', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1A3350', type: 'dashed' } },
        axisLabel: { color: '#5A7A9A', fontSize: 10 },
      },
      series: [
        { name: '氯碱制氢', type: 'bar', data: H_CA,  stack: 'h2', barMaxWidth: 16, itemStyle: { color: '#00F3FF', opacity: 0.85 } },
        { name: 'PEM制氢',  type: 'bar', data: H_PEM, stack: 'h2', barMaxWidth: 16, itemStyle: { color: meta.color, opacity: 0.85 } },
        { name: '制氢量',   type: 'line', data: H_CH, smooth: true, symbol: 'none', lineStyle: { color: '#C6F135', width: 2 } },
        { name: '储氢量',   type: 'line', data: H_HS, smooth: true, symbol: 'none', lineStyle: { color: '#CE93D8', width: 2, type: 'dashed' } },
      ],
    }
  }, [activeStrategy, dataset, strategyMeta])

  useEChart(containerRef, option, [activeStrategy])

  return <div ref={containerRef} className="w-full h-full" />
}
