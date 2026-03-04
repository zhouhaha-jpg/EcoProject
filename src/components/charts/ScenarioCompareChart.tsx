/**
 * 方案对比图表：基准 vs 推演 的成本、碳排、综合指标柱状图
 * 在方案对比页有 scenarioDataset 时自动展示
 */
import { useRef, useMemo } from 'react'
import { useEChart } from './useEChart'
import type { StrategyKey } from '@/types'

const STRATEGY_ORDER: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']
const STRATEGY_LABELS: Record<StrategyKey, string> = {
  uci: 'UCI', cicos: 'CICOS', cicar: 'CICAR',
  cicom: 'CICOM', pv: 'PV', es: 'ES',
}

interface SummaryItem {
  cost: number
  carbon: number
  combined: number
}

interface ScenarioCompareChartProps {
  baseSummary: Record<StrategyKey, SummaryItem>
  scenarioSummary: Record<StrategyKey, SummaryItem>
  /** 展示的指标 */
  metric?: 'cost' | 'carbon' | 'combined'
}

export default function ScenarioCompareChart({
  baseSummary,
  scenarioSummary,
  metric = 'combined',
}: ScenarioCompareChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const option = useMemo(() => {
    const categories = STRATEGY_ORDER.map(sk => STRATEGY_LABELS[sk])
    const baseData = STRATEGY_ORDER.map(sk => baseSummary[sk]?.[metric] ?? 0)
    const scenarioData = STRATEGY_ORDER.map(sk => scenarioSummary[sk]?.[metric] ?? 0)

    const yAxisFormatter = (v: number) => {
      if (metric === 'cost') return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
      return String(v)
    }

    return {
      backgroundColor: 'transparent',
      grid: { top: 20, right: 16, bottom: 36, left: 48 },
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: 'rgba(7,12,20,0.95)',
        borderColor: '#1e3256',
        textStyle: { color: '#e8f4ff', fontSize: 11 },
        formatter: (params: unknown) => {
          const arr = params as Array<{ seriesName: string; value: number; axisValue: string }>
          const idx = categories.indexOf(arr[0]?.axisValue ?? '')
          const sk = STRATEGY_ORDER[idx]
          const b = baseSummary[sk]
          const s = scenarioSummary[sk]
          if (!b || !s) return ''
          const pct = (a: number, bv: number) =>
            bv === 0 ? '--' : `${((a - bv) / bv * 100).toFixed(1)}%`
          let html = `<div style="font-family:'Rajdhani';font-size:12px;color:#00d4ff;margin-bottom:6px">${STRATEGY_LABELS[sk]}</div>`
          html += `<div style="color:#8ba9cc">基准: <b>${b[metric].toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</b></div>`
          html += `<div style="color:#8ba9cc">推演: <b>${s[metric].toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</b> <span style="color:${s[metric] <= b[metric] ? '#69f0ae' : '#ff7043'}">(${pct(s[metric], b[metric])})</span></div>`
          return html
        },
      },
      legend: {
        data: ['基准', '推演'],
        bottom: 4,
        textStyle: { color: '#8ba9cc', fontSize: 10 },
        itemWidth: 12,
        itemHeight: 8,
      },
      xAxis: {
        type: 'category' as const,
        data: categories,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: { color: '#3d6080', fontSize: 10 },
        axisTick: { lineStyle: { color: '#1e3256' } },
      },
      yAxis: {
        type: 'value' as const,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: { color: '#3d6080', fontSize: 9, formatter: yAxisFormatter },
        splitLine: { lineStyle: { color: '#111b2e', type: 'dashed' as const } },
        axisTick: { show: false },
      },
      series: [
        {
          name: '基准',
          type: 'bar' as const,
          data: baseData,
          itemStyle: { color: '#4e9eff' },
          barMaxWidth: 24,
        },
        {
          name: '推演',
          type: 'bar' as const,
          data: scenarioData,
          itemStyle: { color: '#ff7043' },
          barMaxWidth: 24,
        },
      ],
    }
  }, [baseSummary, scenarioSummary, metric])

  useEChart(containerRef, option, [baseSummary, scenarioSummary, metric])

  return <div ref={containerRef} className="w-full h-full min-h-[140px]" />
}
