import * as XLSX from 'xlsx'
import type { EcoDataset, StrategyKey } from '@/types'

const STRATEGIES: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']
const STRATEGY_LABELS: Record<StrategyKey, string> = {
  uci: 'UCI (统一控制综合)',
  cicos: 'CICOS (成本优化集成)',
  cicar: 'CICAR (碳排优化集成)',
  cicom: 'CICOM (综合优化集成)',
  pv: 'PV (光伏优先优化)',
  es: 'ES (储能综合优化)',
}
const STRATEGY_SHORT: Record<StrategyKey, string> = {
  uci: 'UCI', cicos: 'CICOS', cicar: 'CICAR', cicom: 'CICOM', pv: 'PV', es: 'ES',
}

function sanitizeFileNamePart(value: string) {
  return String(value || '推演').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
}

function toExportStamp() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`
}

function pct(a: number, b: number): string {
  if (b === 0) return '--'
  const v = ((a - b) / b) * 100
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

/**
 * @description 构建单个策略的 24h 设备调度曲线 Sheet 数据
 */
function buildDeviceSheet(ds: EcoDataset, sk: StrategyKey): unknown[][] {
  const header = ['时刻', '电解槽 (kW)', '光伏 (kW)', '燃机 (kW)', 'PEM (kW)', '购电 (kW)', '储能 (kW)']
  const rows: unknown[][] = [header]
  for (let h = 0; h < 24; h++) {
    rows.push([
      `${h + 1}h`,
      ds.P_CA[sk]?.[h] ?? '',
      ds.P_PV[sk]?.[h] ?? '',
      ds.P_GM[sk]?.[h] ?? '',
      ds.P_PEM[sk]?.[h] ?? '',
      ds.P_G[sk]?.[h] ?? '',
      ds.P_es_es?.[h] ?? '',
    ])
  }
  return rows
}

/**
 * @description 将 What-if 推演结果导出为 xlsx 文件，包含策略对比汇总和每策略设备调度曲线
 */
export function exportScenarioWorkbook(
  baseDataset: EcoDataset,
  scenarioDataset: EcoDataset,
  label?: string,
): void {
  const baseSummary = baseDataset.summary
  const scenSummary = scenarioDataset.summary

  const summaryHeader = [
    '策略', '基准成本', '推演成本', '成本变化',
    '基准碳排', '推演碳排', '碳排变化',
    '基准综合', '推演综合', '综合变化',
  ]
  const summaryRows: unknown[][] = [summaryHeader]
  for (const sk of STRATEGIES) {
    const base = baseSummary[sk]
    const scen = scenSummary[sk]
    if (!base || !scen) continue
    summaryRows.push([
      STRATEGY_LABELS[sk],
      base.cost, scen.cost, pct(scen.cost, base.cost),
      base.carbon, scen.carbon, pct(scen.carbon, base.carbon),
      base.combined, scen.combined, pct(scen.combined, base.combined),
    ])
  }

  const wb = XLSX.utils.book_new()

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  summarySheet['!cols'] = summaryHeader.map(() => ({ wch: 16 }))
  XLSX.utils.book_append_sheet(wb, summarySheet, '策略对比汇总')

  for (const sk of STRATEGIES) {
    const sheetData = buildDeviceSheet(scenarioDataset, sk)
    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    ws['!cols'] = sheetData[0].map(() => ({ wch: 14 }))
    XLSX.utils.book_append_sheet(wb, ws, `推演曲线-${STRATEGY_SHORT[sk]}`)
  }

  for (const sk of STRATEGIES) {
    const sheetData = buildDeviceSheet(baseDataset, sk)
    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    ws['!cols'] = sheetData[0].map(() => ({ wch: 14 }))
    XLSX.utils.book_append_sheet(wb, ws, `基准曲线-${STRATEGY_SHORT[sk]}`)
  }

  const fileName = `调度推演_${sanitizeFileNamePart(label ?? 'What-if')}_${toExportStamp()}.xlsx`
  XLSX.writeFile(wb, fileName)
}
