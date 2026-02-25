import { useRef, useMemo } from 'react'
import { useStrategy } from '@/context/StrategyContext'
import { useEChart } from './useEChart'
import { getHours } from '@/data/realData'
import type { StrategyKey } from '@/types'

const POWER_COLORS = {
  P_CA:  '#00F3FF',
  P_PV:  '#C6F135',
  P_GM:  '#FFD740',
  P_PEM: '#FF7043',
  P_G:   '#CE93D8',
} as const

const POWER_NAMES = {
  P_CA:  '氯碱负荷',
  P_PV:  '光伏出力',
  P_GM:  '燃气轮机',
  P_PEM: 'PEM电解槽',
  P_G:   '电网购电',
} as const

type PowerMetric = keyof typeof POWER_NAMES
const POWER_METRICS: PowerMetric[] = ['P_CA', 'P_PV', 'P_GM', 'P_PEM', 'P_G']

interface PowerBalanceChartProps {
  strategies?: StrategyKey[]
  playbackHour?: number
}

export default function PowerBalanceChart({ strategies, playbackHour }: PowerBalanceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { activeStrategy, dataset } = useStrategy()
  const keys = strategies ?? [activeStrategy]
  const hours = getHours()

  const option = useMemo(() => {
    const series = POWER_METRICS.flatMap((metric) =>
      keys.map(sk => {
        const data = dataset[metric][sk]
        const isUciBaseline = metric === 'P_CA' && sk === 'uci'
        return {
          name: keys.length > 1 ? `${POWER_NAMES[metric]}(${sk.toUpperCase()})` : POWER_NAMES[metric],
          type: 'line',
          smooth: true,
          data: data ?? [],
          lineStyle: { color: POWER_COLORS[metric], width: isUciBaseline ? 1.5 : 2, type: isUciBaseline ? 'dashed' : 'solid' },
          itemStyle: { color: POWER_COLORS[metric] },
          symbol: 'none',
          emphasis: { lineStyle: { width: 3 } },
        }
      })
    )

    return {
      grid: { top: 30, right: 16, bottom: 40, left: 58 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0A1628',
        borderColor: '#00F3FF33',
        textStyle: { color: '#8BA9CC', fontSize: 11 },
        formatter: (params: unknown[]) => {
          const p = params as Array<{ seriesName: string; value: number; color: string; axisValue: number | string }>
          return `<b>第${p[0].axisValue}小时</b><br/>` +
            p.map(x => `<span style="color:${x.color}">●</span> ${x.seriesName}: ${x.value?.toFixed(0)} kW`).join('<br/>')
        },
      },
      legend: {
        top: 4, textStyle: { color: '#8BA9CC', fontSize: 10 },
        icon: 'roundRect', itemWidth: 12, itemHeight: 4,
      },
      axisPointer: {
        link: [{ xAxisIndex: 'all' }],
      },
      xAxis: {
        type: 'category', data: hours,
        axisLine: { lineStyle: { color: '#1A3350' } },
        axisLabel: { color: '#5A7A9A', fontSize: 10, formatter: (v: string) => `${v}h` },
      },
      yAxis: {
        type: 'value', name: 'kW', nameTextStyle: { color: '#5A7A9A', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1A3350', type: 'dashed' } },
        axisLabel: { color: '#5A7A9A', fontSize: 10 },
      },
      series: [
        ...series,
        ...(playbackHour
          ? [{
              name: '播放游标',
              type: 'line',
              data: [],
              markLine: {
                silent: true,
                symbol: ['none', 'none'],
                label: {
                  show: true,
                  formatter: `H${playbackHour}`,
                  color: '#00F3FF',
                  fontSize: 10,
                  backgroundColor: '#0A1628',
                  borderColor: '#00F3FF66',
                  borderWidth: 1,
                  padding: [2, 6],
                },
                lineStyle: {
                  color: '#00F3FFAA',
                  width: 1,
                  type: 'dashed',
                },
                data: [{ xAxis: playbackHour }],
              },
            }]
          : []),
      ],
    }
  }, [keys, dataset, activeStrategy, hours, playbackHour])

  useEChart(containerRef, option, [keys.join(','), activeStrategy, playbackHour])

  return <div ref={containerRef} className="w-full h-full" />
}
