/**
 * 构建注入 LLM 的上下文
 * 包含完整 24h 数据，用于因果追溯和深度分析
 */

import { useLocation } from 'react-router-dom'
import { useStrategy } from '@/context/StrategyContext'
import type { StrategyKey, EcoDataset, DatasetMeta } from '@/types'

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
  datasetMeta: DatasetMeta
  emergencyRunId: number | null
  anomalyRunId: number | null
}

const PAGE_LABELS: Record<string, string> = {
  '/': '总览',
  '/overview': '总览',
  '/economic': '经济指标',
  '/storage': '存储模块',
  '/ca': '电解槽',
  '/pv': '光伏',
  '/gm': '燃气轮机',
  '/pem': '质子膜燃料电池',
  '/g': '电网',
  '/scenario': 'EcoClaw',
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
  const { activeStrategy, dataset, strategyMeta, datasetMeta, emergencyActiveRun } = useStrategy()

  const currentPage = location.pathname || '/'
  const meta = strategyMeta[activeStrategy]

  return {
    currentPage,
    currentPageLabel: PAGE_LABELS[currentPage] ?? currentPage,
    activeStrategy,
    activeStrategyLabel: meta?.fullLabel ?? activeStrategy,
    summary: dataset.summary,
    strategyMeta: Object.fromEntries(
      ALL.map((k) => [k, {
        label: strategyMeta[k].label,
        fullLabel: strategyMeta[k].fullLabel,
        description: strategyMeta[k].description,
      }]),
    ) as Record<StrategyKey, { label: string; fullLabel: string; description: string }>,
    pcaStats: Object.fromEntries(
      ALL.map((k) => [k, stats(dataset.P_CA[k])]),
    ) as Record<StrategyKey, { min: number; max: number; avg: number; peakHour: number }>,
    fullData: dataset,
    datasetMeta,
    emergencyRunId: emergencyActiveRun?.id ?? datasetMeta.emergencyRunId ?? null,
    anomalyRunId: datasetMeta.anomalyRunId ?? null,
  }
}

function fmtArr(arr: number[], digits = 1): string {
  if (!arr?.length) return '[]'
  if (arr.length <= 6) return `[${arr.map((v) => v.toFixed(digits)).join(',')}]`
  return `[${arr.slice(0, 3).map((v) => v.toFixed(digits)).join(',')},...,${arr.slice(-3).map((v) => v.toFixed(digits)).join(',')}]`
}

export function formatContextForLLM(ctx: AgentContextData): string {
  const ds = ctx.fullData
  const lines = [
    `当前页面: ${ctx.currentPageLabel} (${ctx.currentPage})`,
    `当前激活策略: ${ctx.activeStrategyLabel} (${ctx.activeStrategy})`,
    '',
    '## 各方案汇总指标 (cost=运行成本/元 carbon=碳排放/tCO2, combined=综合目标)',
    ...Object.entries(ctx.summary).map(([k, v]) =>
      `- ${k}: cost=${v.cost.toFixed(2)}, carbon=${v.carbon.toFixed(2)}, combined=${v.combined.toFixed(2)}`),
    '',
    '## 各方案说明',
    ...Object.entries(ctx.strategyMeta).map(([k, v]) => `- ${k} (${v.fullLabel}): ${v.description}`),
    '',
    `## 当前数据元信息`,
    `- datasetType=${ctx.datasetMeta.datasetType}`,
    `- viewDate=${ctx.datasetMeta.viewDate}`,
    `- snapshotAt=${ctx.datasetMeta.snapshotAt}`,
    `- isHistorical=${ctx.datasetMeta.isHistorical}`,
    `- emergencyRunId=${ctx.emergencyRunId ?? 'null'}`,
    `- anomalyRunId=${ctx.anomalyRunId ?? 'null'}`,
    '',
    `## 电解槽负荷统计 P_CA`,
    ...ALL.map((k) => {
      const s = ctx.pcaStats[k]
      return `- ${k}: min=${s.min.toFixed(1)}, max=${s.max.toFixed(1)}, avg=${s.avg.toFixed(1)}, peakHour=${s.peakHour}`
    }),
    '',
    '## 当前激活策略关键 24h 时序',
    `- P_CA: ${fmtArr(ds.P_CA[ctx.activeStrategy])}`,
    `- P_PV: ${fmtArr(ds.P_PV[ctx.activeStrategy])}`,
    `- P_GM: ${fmtArr(ds.P_GM[ctx.activeStrategy])}`,
    `- P_PEM: ${fmtArr(ds.P_PEM[ctx.activeStrategy])}`,
    `- P_G: ${fmtArr(ds.P_G[ctx.activeStrategy])}`,
    `- P_es_es: ${fmtArr(ds.P_es_es)}`,
    `- ef_g: ${fmtArr(ds.ef_g, 4)}`,
    `- H_CA: ${fmtArr(ds.H_CA[ctx.activeStrategy], 4)}`,
    `- H_PEM: ${fmtArr(ds.H_PEM[ctx.activeStrategy], 4)}`,
    `- H_CH: ${fmtArr(ds.H_CH[ctx.activeStrategy], 4)}`,
    `- H_HS: ${fmtArr(ds.H_HS[ctx.activeStrategy], 4)}`,
  ]

  return lines.join('\n')
}
