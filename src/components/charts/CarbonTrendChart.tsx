import { useRef, useMemo } from 'react'
import { useStrategy } from '@/context/StrategyContext'
import { useEChart } from './useEChart'
import { getHours } from '@/data/realData'

export default function CarbonTrendChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { activeStrategy, dataset, strategyMeta } = useStrategy()
  const hours = getHours()

  const option = useMemo(() => {
    const d = dataset[activeStrategy]
    const meta = strategyMeta[activeStrategy]
    // Hourly CO2 = ef_g * P_G
    const ef = d.ef_g as number[]
    const pg = d.P_G as number[]
    const co2 = ef.map((e, i) => +(e * pg[i]).toFixed(4))

    return {
      grid: { top: 30, right: 16, bottom: 40, left: 58 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0A1628',
        borderColor: '#00F3FF33',
        textStyle: { color: '#8BA9CC', fontSize: 11 },
        formatter: (params: unknown[]) => {
          const p = params as Array<{ value: number; axisValue: number }>
          return `第${p[0].axisValue}小时<br/>CO₂排放: ${p[0].value?.toFixed(4)} tCO₂`
        },
      },
      xAxis: {
        type: 'category', data: hours,
        axisLine: { lineStyle: { color: '#1A3350' } },
        axisLabel: { color: '#5A7A9A', fontSize: 10, formatter: (v: string) => `${v}h` },
      },
      yAxis: {
        type: 'value', name: 'tCO₂', nameTextStyle: { color: '#5A7A9A', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1A3350', type: 'dashed' } },
        axisLabel: { color: '#5A7A9A', fontSize: 10 },
      },
      series: [{
        name: 'CO₂排放',
        type: 'bar',
        data: co2,
        itemStyle: { color: meta.color, opacity: 0.8 },
        emphasis: { itemStyle: { opacity: 1 } },
        barMaxWidth: 18,
      }, {
        name: 'ef_g',
        type: 'line',
        yAxisIndex: 0,
        data: ef.map(e => +(e * 12000).toFixed(4)),
        lineStyle: { color: '#FF7043', type: 'dashed', width: 1 },
        symbol: 'none',
        tooltip: { show: false },
      }],
    }
  }, [activeStrategy, dataset, strategyMeta])

  useEChart(containerRef, option, [activeStrategy])

  return <div ref={containerRef} className="w-full h-full" />
}
