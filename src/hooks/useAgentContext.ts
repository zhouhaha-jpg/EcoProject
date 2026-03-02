/**
 * 构建注入 LLM 的上下文
 * 从 location + strategy 提取当前页面、策略、数据摘要等
 */

import { useLocation } from 'react-router-dom'
import { useStrategy } from '@/context/StrategyContext'
import type { StrategyKey } from '@/types'

export interface AgentContextData {
  currentPage: string
  currentPageLabel: string
  activeStrategy: StrategyKey
  activeStrategyLabel: string
  summary: Record<StrategyKey, { cost: number; carbon: number; combined: number }>
  strategyMeta: Record<
    StrategyKey,
    { label: string; fullLabel: string; description: string }
  >
  /** P_CA 各策略的 min/max/avg（用于时序解释） */
  pcaStats: Record<
    StrategyKey,
    { min: number; max: number; avg: number; peakHour: number }
  >
}

const PAGE_LABELS: Record<string, string> = {
  '/': '电解槽',
  '/ca': '电解槽',
  '/pv': '光伏',
  '/gm': '燃气轮机',
  '/pem': '质子膜燃料电池',
  '/g': '电网',
}

function computeStats(arr: number[]) {
  if (arr.length === 0)
    return { min: 0, max: 0, avg: 0, peakHour: 0 }
  const min = Math.min(...arr)
  const max = Math.max(...arr)
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length
  const peakHour = arr.indexOf(max) + 1 // 1-based hour
  return { min, max, avg, peakHour }
}

export function useAgentContext(): AgentContextData {
  const location = useLocation()
  const { activeStrategy, dataset, strategyMeta } = useStrategy()

  const currentPage = location.pathname || '/'
  const currentPageLabel = PAGE_LABELS[currentPage] ?? currentPage
  const meta = strategyMeta[activeStrategy]
  const activeStrategyLabel = meta?.fullLabel ?? activeStrategy

  const pcaStats = Object.fromEntries(
    (['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es'] as StrategyKey[]).map(
      (key) => [key, computeStats(dataset.P_CA[key])]
    )
  ) as Record<StrategyKey, { min: number; max: number; avg: number; peakHour: number }>

  return {
    currentPage,
    currentPageLabel,
    activeStrategy,
    activeStrategyLabel,
    summary: dataset.summary,
    strategyMeta: Object.fromEntries(
      (['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es'] as StrategyKey[]).map(
        (key) => [
          key,
          {
            label: strategyMeta[key].label,
            fullLabel: strategyMeta[key].fullLabel,
            description: strategyMeta[key].description,
          },
        ]
      )
    ) as Record<StrategyKey, { label: string; fullLabel: string; description: string }>,
    pcaStats,
  }
}

/** 将上下文序列化为可注入 LLM 的文本摘要 */
export function formatContextForLLM(ctx: AgentContextData): string {
  const lines = [
    `当前页面: ${ctx.currentPageLabel} (${ctx.currentPage})`,
    `当前激活策略: ${ctx.activeStrategyLabel} (${ctx.activeStrategy})`,
    '',
    '## 各方案汇总指标 (cost: 运行成本/元, carbon: 碳排放/tCO2, combined: 综合目标)',
    ...Object.entries(ctx.summary).map(
      ([k, v]) =>
        `- ${k}: cost=${v.cost.toFixed(2)}, carbon=${v.carbon.toFixed(2)}, combined=${v.combined.toFixed(2)}`
    ),
    '',
    '## 各方案 P_CA 电解槽功率统计 (min/max/avg kW, peakHour: 峰值小时)',
    ...Object.entries(ctx.pcaStats).map(
      ([k, v]) =>
        `- ${k}: min=${v.min.toFixed(0)}, max=${v.max.toFixed(0)}, avg=${v.avg.toFixed(0)}, peakHour=${v.peakHour}`
    ),
    '',
    '## 各方案说明',
    ...Object.entries(ctx.strategyMeta).map(
      ([k, v]) => `- ${k} (${v.fullLabel}): ${v.description}`
    ),
  ]
  return lines.join('\n')
}
