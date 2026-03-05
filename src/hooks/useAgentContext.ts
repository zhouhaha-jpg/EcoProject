/**
 * 构建注入 LLM 的上下文
 * 包含完整 24h 数据，用于因果追溯和深度分析
 */

import { useLocation } from 'react-router-dom'
import { useStrategy } from '@/context/StrategyContext'
import type { StrategyKey, EcoDataset } from '@/types'

const ALL: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']

export interface AgentContextData {
  currentPage: string
  currentPageLabel: string
  activeStrategy: StrategyKey
  activeStrategyLabel: string
  summary: Record<StrategyKey, { cost: number; carbon: number; combined: number }>
  strategyMeta: Record<StrategyKey, { label: string; fullLabel: string; description: string }>
  pcaStats: Record<StrategyKey, { min: number; max: number; avg: number; peakHour: number }>
  fullData: EcoDataset
}

const PAGE_LABELS: Record<string, string> = {
  '/': '总览', '/overview': '总览',
  '/economic': '经济指标', '/storage': '存储模块',
  '/ca': '电解槽', '/pv': '光伏', '/gm': '燃气轮机',
  '/pem': '质子膜燃料电池', '/g': '电网', '/scenario': 'Agent工作区',
}

function stats(arr: number[]) {
  if (!arr?.length) return { min: 0, max: 0, avg: 0, peakHour: 0 }
  const min = Math.min(...arr)
  const max = Math.max(...arr)
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length
  return { min, max, avg, peakHour: arr.indexOf(max) + 1 }
}

export function useAgentContext(): AgentContextData {
  const location = useLocation()
  const { activeStrategy, dataset, strategyMeta } = useStrategy()

  const currentPage = location.pathname || '/'
  const meta = strategyMeta[activeStrategy]

  return {
    currentPage,
    currentPageLabel: PAGE_LABELS[currentPage] ?? currentPage,
    activeStrategy,
    activeStrategyLabel: meta?.fullLabel ?? activeStrategy,
    summary: dataset.summary,
    strategyMeta: Object.fromEntries(
      ALL.map((k) => [k, { label: strategyMeta[k].label, fullLabel: strategyMeta[k].fullLabel, description: strategyMeta[k].description }])
    ) as Record<StrategyKey, { label: string; fullLabel: string; description: string }>,
    pcaStats: Object.fromEntries(ALL.map((k) => [k, stats(dataset.P_CA[k])])) as Record<StrategyKey, { min: number; max: number; avg: number; peakHour: number }>,
    fullData: dataset,
  }
}

function fmtArr(arr: number[], digits = 1): string {
  if (!arr?.length) return '[]'
  if (arr.length <= 6) return `[${arr.map(v => v.toFixed(digits)).join(',')}]`
  return `[${arr.slice(0, 3).map(v => v.toFixed(digits)).join(',')},...,${arr.slice(-3).map(v => v.toFixed(digits)).join(',')}]`
}

export function formatContextForLLM(ctx: AgentContextData): string {
  const ds = ctx.fullData
  const lines = [
    `当前页面: ${ctx.currentPageLabel} (${ctx.currentPage})`,
    `当前激活策略: ${ctx.activeStrategyLabel} (${ctx.activeStrategy})`,
    '',
    '## 各方案汇总指标 (cost=运行成本/元, carbon=碳排放/tCO2, combined=综合目标)',
    ...Object.entries(ctx.summary).map(([k, v]) =>
      `- ${k}: cost=${v.cost.toFixed(2)}, carbon=${v.carbon.toFixed(2)}, combined=${v.combined.toFixed(2)}`),
    '',
    '## 各方案说明',
    ...Object.entries(ctx.strategyMeta).map(([k, v]) => `- ${k} (${v.fullLabel}): ${v.description}`),
    '',
    '## 各方案 P_CA 电解槽功率统计 (kW)',
    ...Object.entries(ctx.pcaStats).map(([k, v]) =>
      `- ${k}: min=${v.min.toFixed(0)}, max=${v.max.toFixed(0)}, avg=${v.avg.toFixed(0)}, peakHour=${v.peakHour}`),
  ]

  const sk = ctx.activeStrategy
  lines.push('', `## ${sk} 方案完整 24h 数据`)
  if (ds.P_CA?.[sk]) lines.push(`P_CA(kW): ${fmtArr(ds.P_CA[sk], 0)}`)
  if (ds.P_PV?.[sk]) lines.push(`P_PV(kW): ${fmtArr(ds.P_PV[sk], 0)}`)
  if (ds.P_GM?.[sk]) lines.push(`P_GM(kW): ${fmtArr(ds.P_GM[sk], 0)}`)
  if (ds.P_PEM?.[sk]) lines.push(`P_PEM(kW): ${fmtArr(ds.P_PEM[sk], 0)}`)
  if (ds.P_G?.[sk]) lines.push(`P_G(kW): ${fmtArr(ds.P_G[sk], 0)}`)
  if (ds.H_HS?.[sk]) lines.push(`H_HS(t): ${fmtArr(ds.H_HS[sk], 3)}`)
  if (ds.ef_g) lines.push(`ef_g(tCO2/kWh): ${fmtArr(ds.ef_g, 6)}`)
  if (ds.P_es_es) lines.push(`P_es_es(kW): ${fmtArr(ds.P_es_es, 1)}`)

  return lines.join('\n')
}
