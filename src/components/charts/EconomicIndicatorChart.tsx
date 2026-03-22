/**
 * 经济指标图表：成本、碳排放、综合指标在各策略下的对比
 * 支持 compact 模式用于总览页小图
 */
import { useMemo, useRef } from 'react'
import { useStrategy } from '@/context/StrategyContext'
import { useEChart } from './useEChart'
import type { StrategyKey } from '@/types'

const STRATEGY_COLORS: Record<StrategyKey, { top: string; mid: string; base: string }> = {
  uci: { top: '#8cc7ff', mid: '#58a8ff', base: '#2f6bff' },
  cicos: { top: '#ffb28f', mid: '#ff7f57', base: '#ff4d2e' },
  cicar: { top: '#7ef2ff', mid: '#32d7ff', base: '#00a8ff' },
  cicom: { top: '#f0b8ff', mid: '#cf8ff0', base: '#9258e5' },
  pv: { top: '#f0ff8c', mid: '#d5ff36', base: '#8ddc00' },
  es: { top: '#fff1a1', mid: '#ffd85f', base: '#ffb300' },
}

const STRATEGY_ORDER: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']

const STRATEGY_LABELS: Record<StrategyKey, string> = {
  uci: 'UCI',
  cicos: 'CICOS',
  cicar: 'CICAR',
  cicom: 'CICOM',
  pv: 'PV',
  es: 'ES',
}

const METRIC_LABELS: Record<string, string> = {
  cost: '成本 (元)',
  carbon: '碳排放 (tCO2)',
  combined: '综合指标',
}

interface EconomicIndicatorChartProps {
  compact?: boolean
  metric?: 'cost' | 'carbon' | 'combined'
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function EconomicIndicatorChart({ compact = false, metric = 'combined' }: EconomicIndicatorChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { dataset } = useStrategy()
  const summary = dataset?.summary as Record<StrategyKey, { cost: number; carbon: number; combined: number }> | undefined

  const option = useMemo(() => {
    if (!summary) return null

    const metrics = compact ? ['combined'] : [metric]
    const categories = STRATEGY_ORDER.map((sk) => STRATEGY_LABELS[sk])
    const activeMetric = metrics[0] as 'cost' | 'carbon' | 'combined'
    const data = STRATEGY_ORDER.map((sk) => summary[sk]?.[activeMetric] ?? 0)
    const grid = compact
      ? { top: 16, right: 14, bottom: 30, left: 42 }
      : { top: 24, right: 18, bottom: 42, left: 56 }

    const yAxisFormatter = (value: number) => {
      if (activeMetric === 'cost') return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)
      return String(value)
    }

    return {
      backgroundColor: 'transparent',
      animationDuration: 280,
      animationDurationUpdate: 320,
      grid,
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: {
          type: 'shadow' as const,
          shadowStyle: { color: 'rgba(0,212,255,0.06)' },
        },
        backgroundColor: 'rgba(7,12,20,0.96)',
        borderColor: '#1e3256',
        borderWidth: 1,
        textStyle: { color: '#e8f4ff', fontSize: 11, fontFamily: "'Share Tech Mono', monospace" },
        formatter: (params: unknown) => {
          const arr = params as Array<{ axisValue: string }>
          const idx = categories.indexOf(arr[0]?.axisValue ?? '')
          const sk = STRATEGY_ORDER[idx]
          const item = summary[sk]
          if (!item) return ''
          return [
            `<div style="font-family:Rajdhani,sans-serif;font-size:13px;color:#00d4ff;margin-bottom:6px;letter-spacing:1px">${STRATEGY_LABELS[sk]}</div>`,
            `<div style="color:#8ba9cc">成本: <b style="color:#e8f4ff">${item.cost.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> 元</div>`,
            `<div style="color:#8ba9cc">碳排放: <b style="color:#e8f4ff">${item.carbon.toFixed(2)}</b> tCO2</div>`,
            `<div style="color:#8ba9cc">综合指标: <b style="color:#e8f4ff">${item.combined.toFixed(2)}</b></div>`,
          ].join('')
        },
      },
      legend: compact
        ? { show: false }
        : {
            data: [METRIC_LABELS[activeMetric]],
            bottom: 4,
            itemWidth: 12,
            itemHeight: 8,
            textStyle: {
              color: '#8ba9cc',
              fontSize: 10,
              fontFamily: "'Share Tech Mono', monospace",
            },
          },
      xAxis: {
        type: 'category' as const,
        data: categories,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisTick: { lineStyle: { color: '#1e3256' } },
        axisLabel: {
          color: '#5a7a9a',
          fontSize: compact ? 9 : 10,
          rotate: compact ? 12 : 0,
          fontFamily: "'Share Tech Mono', monospace",
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#5a7a9a',
          fontSize: compact ? 9 : 10,
          fontFamily: "'Share Tech Mono', monospace",
          formatter: yAxisFormatter,
        },
        splitLine: { lineStyle: { color: '#111b2e', type: 'dashed' as const } },
      },
      series: [
        {
          name: METRIC_LABELS[activeMetric],
          type: 'bar' as const,
          data,
          z: 3,
          barMaxWidth: compact ? 16 : 26,
          itemStyle: {
            borderRadius: [8, 8, 3, 3],
            borderWidth: 1,
            borderColor: (params: { dataIndex: number }) => {
              const palette = STRATEGY_COLORS[STRATEGY_ORDER[params.dataIndex]]
              return hexToRgba(palette.top, 0.85)
            },
            color: (params: { dataIndex: number }) => {
              const palette = STRATEGY_COLORS[STRATEGY_ORDER[params.dataIndex]]
              return {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: palette.top },
                  { offset: 0.35, color: palette.mid },
                  { offset: 1, color: palette.base },
                ],
              }
            },
            shadowBlur: compact ? 10 : 16,
            shadowColor: (params: { dataIndex: number }) => {
              const palette = STRATEGY_COLORS[STRATEGY_ORDER[params.dataIndex]]
              return hexToRgba(palette.mid, 0.32)
            },
          },
          emphasis: {
            itemStyle: {
              shadowBlur: compact ? 20 : 30,
              shadowColor: 'rgba(0,212,255,0.25)',
            },
          },
          label: compact
            ? undefined
            : {
                show: true,
                position: 'top' as const,
                distance: 10,
                color: '#8ba9cc',
                fontSize: 10,
                fontFamily: "'Share Tech Mono', monospace",
                formatter: ({ value }: { value: number }) => {
                  if (activeMetric === 'cost') return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : `${value.toFixed(0)}`
                  return value.toFixed(activeMetric === 'combined' ? 2 : 0)
                },
              },
        },
        {
          name: '__crest__',
          type: 'bar' as const,
          silent: true,
          data: data.map((value) => (value > 0 ? value * 0.006 : 0)),
          barGap: '-100%',
          barMaxWidth: compact ? 18 : 28,
          z: 4,
          itemStyle: {
            borderRadius: [999, 999, 999, 999],
            color: (params: { dataIndex: number }) => {
              const palette = STRATEGY_COLORS[STRATEGY_ORDER[params.dataIndex]]
              return hexToRgba(palette.top, 0.88)
            },
            shadowBlur: compact ? 10 : 14,
            shadowColor: 'rgba(255,255,255,0.24)',
          },
          tooltip: { show: false },
        },
      ],
    }
  }, [summary, compact, metric])

  useEChart(containerRef, option, [compact, metric, summary])

  return <div ref={containerRef} className="h-full min-h-0 w-full" />
}
