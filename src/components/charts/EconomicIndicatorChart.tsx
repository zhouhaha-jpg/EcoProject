/**
 * 经济指标图表：成本、碳排放、综合指标 在各策略下的对比
 * 支持 compact 模式用于总览页小图
 */
import { useRef, useMemo } from 'react'
import { useStrategy } from '@/context/StrategyContext'
import { useEChart } from './useEChart'
import type { StrategyKey } from '@/types'

const STRATEGY_COLORS: Record<StrategyKey, string> = {
  uci: '#4e9eff', cicos: '#ff7043', cicar: '#29d4ff',
  cicom: '#ce93d8', pv: '#c6f135', es: '#ffd740',
}

const STRATEGY_ORDER: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']

const STRATEGY_LABELS: Record<StrategyKey, string> = {
  uci: 'UCI', cicos: 'CICOS', cicar: 'CICAR',
  cicom: 'CICOM', pv: 'PV', es: 'ES',
}

const METRIC_LABELS: Record<string, string> = {
  cost: '成本 (元)',
  carbon: '碳排放 (tCO2)',
  combined: '综合指标',
}

interface EconomicIndicatorChartProps {
  /** 紧凑模式，用于总览页小图 */
  compact?: boolean
  /** 展示的指标：cost | carbon | combined，compact 时仅 combined */
  metric?: 'cost' | 'carbon' | 'combined'
}

export default function EconomicIndicatorChart({ compact = false, metric = 'combined' }: EconomicIndicatorChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { dataset } = useStrategy()
  const summary = dataset?.summary as Record<StrategyKey, { cost: number; carbon: number; combined: number }> | undefined

  const option = useMemo(() => {
    if (!summary) return null

    const metrics = compact ? ['combined'] : (metric ? [metric] : ['cost', 'carbon', 'combined'])
    const categories = STRATEGY_ORDER.map(sk => STRATEGY_LABELS[sk])
    const series = metrics.map((m, idx) => {
      const data = STRATEGY_ORDER.map(sk => summary[sk]?.[m as keyof typeof summary[typeof sk]] ?? 0)
      return {
        name: METRIC_LABELS[m] ?? m,
        type: 'bar' as const,
        data,
        itemStyle: {
          color: (params: { dataIndex: number }) => STRATEGY_COLORS[STRATEGY_ORDER[params.dataIndex]],
        },
        barMaxWidth: compact ? 16 : 28,
      }
    })

    const isSingleMetric = metrics.length === 1
    const grid = compact
      ? { top: 12, right: 12, bottom: 28, left: 42 }
      : { top: 24, right: 24, bottom: 48, left: 56 }

    return {
      backgroundColor: 'transparent',
      grid,
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: 'rgba(7,12,20,0.95)',
        borderColor: '#1e3256',
        textStyle: { color: '#e8f4ff', fontSize: 11 },
        formatter: (params: unknown) => {
          const arr = params as Array<{ seriesName: string; value: number; color: string; axisValue: string }>
          const idx = categories.indexOf(arr[0]?.axisValue ?? '')
          const sk = STRATEGY_ORDER[idx]
          const s = summary[sk]
          if (!s) return ''
          let html = `<div style="font-family:'Rajdhani';font-size:12px;color:#00d4ff;margin-bottom:6px">${STRATEGY_LABELS[sk]}</div>`
          html += `<div style="color:#8ba9cc">成本: <b>${s.cost.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</b> 元</div>`
          html += `<div style="color:#8ba9cc">碳排放: <b>${s.carbon.toFixed(2)}</b> tCO2</div>`
          html += `<div style="color:#8ba9cc">综合: <b>${s.combined.toFixed(2)}</b></div>`
          return html
        },
      },
      legend: compact ? { show: false } : {
        data: metrics.map(m => METRIC_LABELS[m] ?? m),
        bottom: 4,
        textStyle: { color: '#8ba9cc', fontSize: 10 },
        itemWidth: 12,
        itemHeight: 8,
      },
      xAxis: {
        type: 'category' as const,
        data: categories,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: {
          color: '#3d6080',
          fontSize: compact ? 9 : 11,
          rotate: compact ? 15 : 0,
        },
        axisTick: { lineStyle: { color: '#1e3256' } },
      },
      yAxis: {
        type: 'value' as const,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: {
          color: '#3d6080',
          fontSize: compact ? 9 : 10,
          formatter: (v: number) => {
            if (metrics[0] === 'cost') return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
            return String(v)
          },
        },
        splitLine: { lineStyle: { color: '#111b2e', type: 'dashed' as const } },
        axisTick: { show: false },
      },
      series: isSingleMetric ? series : series,
    }
  }, [summary, compact, metric])

  useEChart(containerRef, option, [compact, metric])

  return <div ref={containerRef} className="w-full h-full min-h-0" />
}
