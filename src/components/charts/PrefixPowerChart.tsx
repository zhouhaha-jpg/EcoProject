/**
 * 按前缀展示功率时序图（P_CA / P_PV / P_GM / P_PEM / P_G）
 * 每个页面展示一张图，6 条线对应 6 种后缀策略
 */
import { useRef, useMemo } from 'react'
import { useStrategy } from '@/context/StrategyContext'
import { useEChart } from './useEChart'
import { getHours } from '@/data/realData'
import type { StrategyKey } from '@/types'
import type { PrefixKey } from '@/types'
import { PREFIX_TO_METRIC } from '@/types'

const STRATEGY_COLORS: Record<StrategyKey, string> = {
  uci: '#4e9eff', cicos: '#ff7043', cicar: '#29d4ff',
  cicom: '#ce93d8', pv: '#c6f135', es: '#ffd740',
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const STRATEGY_ORDER: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']
const HOURS = getHours()

/** 各指标的 Y 轴范围 */
const METRIC_AXIS: Record<string, { min?: number; max?: number; formatter?: (v: number) => string }> = {
  P_CA: { min: 7000, max: 11200, formatter: (v) => `${(v / 1000).toFixed(1)}k` },
  P_PV: { min: 0, max: 6000, formatter: (v) => `${(v / 1000).toFixed(1)}k` },
  P_GM: { min: 0, max: 600, formatter: (v) => v.toFixed(0) },
  P_PEM: { min: 0, max: 9000, formatter: (v) => `${(v / 1000).toFixed(1)}k` },
  P_G: { min: 0, max: 10000, formatter: (v) => `${(v / 1000).toFixed(1)}k` },
}

interface PrefixPowerChartProps {
  prefix: PrefixKey
  title?: string
  onHourHover?: (hourIdx: number, values: { key: StrategyKey; val: number }[]) => void
}

export default function PrefixPowerChart({ prefix, title, onHourHover }: PrefixPowerChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { dataset, selectedStrategies } = useStrategy()
  const metricKey = PREFIX_TO_METRIC[prefix]
  const metricData = dataset[metricKey] as Record<StrategyKey, number[]>
  const axisConfig = METRIC_AXIS[metricKey] ?? { formatter: (v: number) => v.toFixed(0) }

  const onHourHoverRef = useRef(onHourHover)
  onHourHoverRef.current = onHourHover
  const lastHoverHourRef = useRef(-1)

  const option = useMemo(() => {
    const allSelected = selectedStrategies.size === 0 || selectedStrategies.size === 6
    const series = STRATEGY_ORDER.map((sk) => {
      const data = metricData?.[sk] ?? []
      const color = STRATEGY_COLORS[sk]
      const isUci = sk === 'uci'
      const isHighlighted = allSelected || selectedStrategies.has(sk)
      const lineOpacity = isHighlighted ? 1 : 0.12
      const areaOpacity = isHighlighted ? 0.18 : 0.03
      return {
        name: `${metricKey}_${sk}`,
        type: 'line' as const,
        data,
        smooth: 0.3,
        symbol: isUci ? 'circle' : 'none',
        symbolSize: isUci ? 5 : 0,
        lineStyle: {
          color,
          width: isHighlighted ? (isUci ? 1.5 : 2) : 1,
          type: isUci ? ('dashed' as const) : ('solid' as const),
          opacity: lineOpacity,
        },
        itemStyle: { color, opacity: lineOpacity },
        areaStyle: isUci
          ? undefined
          : {
              color: {
                type: 'linear' as const,
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: hexToRgba(color, areaOpacity) },
                  { offset: 1, color: hexToRgba(color, 0) },
                ],
              },
            },
        emphasis: { lineStyle: { width: 3 }, disabled: false },
      }
    })

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
          const arr = params as Array<{ seriesName: string; value: number; color: string; axisValue: string }>
          const hourIdx = Number.parseInt(String(arr[0]?.axisValue ?? '1'), 10) - 1
          const vals = arr.map(p => ({
            key: p.seriesName.replace(`${metricKey}_`, '') as StrategyKey,
            val: p.value,
          }))
          if (onHourHoverRef.current && hourIdx !== lastHoverHourRef.current) {
            lastHoverHourRef.current = hourIdx
            onHourHoverRef.current(hourIdx, vals)
          }
          const uciVal = arr.find(p => p.seriesName.includes('_uci'))?.value ?? 0
          let s = `<div style="font-family:'Rajdhani',sans-serif;font-size:13px;color:#00d4ff;margin-bottom:6px;letter-spacing:1px">第 ${arr[0].axisValue} 小时</div>`
          arr.forEach(p => {
            const delta = p.value - uciVal
            const sign = delta >= 0 ? '+' : ''
            s += `<div style="display:flex;align-items:center;gap:8px;padding:2px 0">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};flex-shrink:0"></span>
              <span style="flex:1;color:#8ba9cc">${p.seriesName}</span>
              <span style="font-weight:700">${p.value.toFixed(1)}</span>
              <span style="color:${delta >= 0 ? '#ff7043' : '#69f0ae'};font-size:10px">${sign}${delta.toFixed(0)}</span>
            </div>`
          })
          return s
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
        min: axisConfig.min,
        max: axisConfig.max,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: {
          color: '#3d6080',
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 10,
          formatter: axisConfig.formatter ?? ((v: number) => v.toFixed(0)),
        },
        splitLine: { lineStyle: { color: '#111b2e', type: 'dashed' as const } },
        axisTick: { show: false },
      },
      series,
    }
  }, [dataset, metricKey, metricData, selectedStrategies])

  useEChart(containerRef, option, ['prefix', prefix])

  return <div ref={containerRef} className="w-full h-full" />
}
