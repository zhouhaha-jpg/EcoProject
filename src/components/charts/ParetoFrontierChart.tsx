/**
 * Pareto 前沿散点图：成本 vs 碳排放，标注最优区间
 */
import { useRef, useMemo } from 'react'
import { useEChart } from './useEChart'
import type { ParetoData } from '@/context/StrategyContext'

interface ParetoFrontierChartProps {
  data: ParetoData
}

export default function ParetoFrontierChart({ data }: ParetoFrontierChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { results, param_name, optimalRange } = data

  const option = useMemo(() => {
    const points = results.map((r) => [r.carbon, r.cost, r.paramValue, r.combined] as [number, number, number, number])
    if (results.length === 0) return null
    const costs = results.map((r) => r.cost)
    const carbons = results.map((r) => r.carbon)
    const costMin = Math.min(...costs)
    const costMax = Math.max(...costs)
    const carbonMin = Math.min(...carbons)
    const carbonMax = Math.max(...carbons)
    const costPad = Math.max((costMax - costMin) * 0.08, 5000)
    const carbonPad = Math.max((carbonMax - carbonMin) * 0.08, 5)
    const yMin = Math.floor((costMin - costPad) / 1000) * 1000
    const yMax = Math.ceil((costMax + costPad) / 1000) * 1000
    const xMin = Math.floor((carbonMin - carbonPad) * 10) / 10
    const xMax = Math.ceil((carbonMax + carbonPad) * 10) / 10

    return {
      backgroundColor: 'transparent',
      grid: { top: 24, right: 24, bottom: 48, left: 56 },
      xAxis: {
        type: 'value' as const,
        min: xMin,
        max: xMax,
        name: '碳排放 (tCO2)',
        nameLocation: 'middle' as const,
        nameGap: 28,
        nameTextStyle: { color: '#3d6080', fontSize: 10 },
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: { color: '#3d6080', fontSize: 10 },
        splitLine: { lineStyle: { color: '#111b2e', type: 'dashed' as const } },
      },
      yAxis: {
        type: 'value' as const,
        min: yMin,
        max: yMax,
        name: '成本 (元)',
        nameLocation: 'middle' as const,
        nameGap: 42,
        nameTextStyle: { color: '#3d6080', fontSize: 10 },
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: { color: '#3d6080', fontSize: 10, formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)) },
        splitLine: { lineStyle: { color: '#111b2e', type: 'dashed' as const } },
      },
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: 'rgba(7,12,20,0.95)',
        borderColor: '#1e3256',
        textStyle: { color: '#e8f4ff', fontSize: 11 },
        formatter: (params: unknown) => {
          const p = params as { value: [number, number, number, number] }
          const [carbon, cost, pv, combined] = p.value
          const inOptimal = optimalRange && pv >= optimalRange.min && pv <= optimalRange.max
          return `<div style="font-family:Rajdhani;font-size:12px;color:#00d4ff;margin-bottom:6px">${param_name}=${pv}${inOptimal ? ' ✓ 最优区间' : ''}</div>
            <div style="color:#8ba9cc">成本: <b>${cost.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</b> 元</div>
            <div style="color:#8ba9cc">碳排: <b>${carbon.toFixed(2)}</b> tCO2</div>
            <div style="color:#8ba9cc">综合: <b>${combined.toFixed(2)}</b></div>`
        },
      },
      series: [
        {
          name: 'Pareto 扫描点',
          type: 'scatter' as const,
          data: points,
          symbolSize: (val: unknown[]) => {
            const pv = val[2] as number
            const inOptimal = optimalRange && pv >= optimalRange.min && pv <= optimalRange.max
            return inOptimal ? 16 : 10
          },
          itemStyle: {
            color: (params: { value: [number, number, number, number] }) => {
              const pv = params.value[2]
              const inOptimal = optimalRange && pv >= optimalRange.min && pv <= optimalRange.max
              return inOptimal ? '#69f0ae' : '#4e9eff'
            },
            borderColor: (params: { value: [number, number, number, number] }) => {
              const pv = params.value[2]
              const inOptimal = optimalRange && pv >= optimalRange.min && pv <= optimalRange.max
              return inOptimal ? '#00d4ff' : 'transparent'
            },
            borderWidth: (params: { value: [number, number, number, number] }) => {
              const pv = params.value[2]
              const inOptimal = optimalRange && pv >= optimalRange.min && pv <= optimalRange.max
              return inOptimal ? 2 : 0
            },
          },
          label: {
            show: true,
            formatter: (params: { value: [number, number, number, number] }) => `${params.value[2]}`,
            position: 'top' as const,
            color: '#8ba9cc',
            fontSize: 9,
          },
        },
      ],
    }
  }, [results, param_name, optimalRange])

  useEChart(containerRef, option, [data])

  return <div ref={containerRef} className="w-full h-full min-h-[240px]" />
}
