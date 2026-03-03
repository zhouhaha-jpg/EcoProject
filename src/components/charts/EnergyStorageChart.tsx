/**
 * 储能罐 P_es_es 功率时序图：24 小时 (kW)
 */
import { useRef, useMemo } from 'react'
import { useStrategy } from '@/context/StrategyContext'
import { useEChart } from './useEChart'
import { getHours } from '@/data/realData'

const HOURS = getHours()

export default function EnergyStorageChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { dataset } = useStrategy()
  const data = (dataset?.P_es_es as number[]) ?? []

  const option = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      grid: { top: 20, bottom: 80, left: 68, right: 20 },
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'cross' as const, crossStyle: { color: 'rgba(0,212,255,0.4)' } },
        backgroundColor: 'rgba(7,12,20,0.95)',
        borderColor: '#1e3256',
        textStyle: { color: '#e8f4ff', fontSize: 11, fontFamily: "'Share Tech Mono', monospace" },
        formatter: (params: unknown) => {
          const arr = params as Array<{ value: number; axisValue: string }>
          const v = arr[0]?.value ?? 0
          return `<div style="font-family:'Rajdhani',sans-serif;font-size:13px;color:#00d4ff;margin-bottom:6px">第 ${arr[0]?.axisValue ?? '1'} 小时</div>
            <div style="color:#8ba9cc">储能功率: <b style="color:#ffd740">${v.toFixed(2)}</b> kW</div>`
        },
      },
      legend: { show: false },
      toolbox: {
        feature: { brush: { type: ['rect', 'clear'] } },
        iconStyle: { borderColor: '#3d6080' },
        emphasis: { iconStyle: { borderColor: '#00d4ff' } },
        top: 5,
        right: 20,
      },
      brush: {
        toolbox: ['rect', 'clear'],
        brushStyle: {
          borderWidth: 1,
          borderColor: 'rgba(0,212,255,0.6)',
          color: 'rgba(0,212,255,0.05)',
        },
        outOfBrush: { colorAlpha: 0.15 },
      },
      xAxis: {
        type: 'category' as const,
        data: HOURS.map(h => `${h}h`),
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: { color: '#3d6080', fontFamily: "'Share Tech Mono', monospace", fontSize: 10 },
        axisTick: { lineStyle: { color: '#1e3256' } },
        splitLine: { show: true, lineStyle: { color: '#111b2e', type: 'dashed' as const } },
      },
      yAxis: {
        type: 'value' as const,
        min: 0,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: {
          color: '#3d6080',
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 10,
          formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v),
        },
        splitLine: { lineStyle: { color: '#111b2e', type: 'dashed' as const } },
        axisTick: { show: false },
      },
      series: [
        {
          name: 'P_es_es',
          type: 'line' as const,
          data,
          smooth: 0.3,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { color: '#ffd740', width: 2 },
          itemStyle: { color: '#ffd740' },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(255,215,64,0.25)' },
                { offset: 1, color: 'rgba(255,215,64,0)' },
              ],
            },
          },
          emphasis: { lineStyle: { width: 3 }, disabled: false },
        },
      ],
    }
  }, [dataset, data])

  useEChart(containerRef, option, ['P_es_es'])

  return <div ref={containerRef} className="w-full h-full" />
}
