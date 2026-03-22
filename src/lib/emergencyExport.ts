import * as XLSX from 'xlsx'
import type { EmergencyRun } from '@/types'

function sanitizeFileNamePart(value: string) {
  return String(value || '预案').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')
}

function toExportStamp(input?: string) {
  const date = input ? new Date(input) : new Date()
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  const yyyy = safeDate.getFullYear()
  const mm = String(safeDate.getMonth() + 1).padStart(2, '0')
  const dd = String(safeDate.getDate()).padStart(2, '0')
  const hh = String(safeDate.getHours()).padStart(2, '0')
  const mi = String(safeDate.getMinutes()).padStart(2, '0')
  const ss = String(safeDate.getSeconds()).padStart(2, '0')
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`
}

export function exportEmergencyRunWorkbook(run: EmergencyRun) {
  const detail = run.detailPayload
  const spec = run.eventSpec

  const descriptionSheet = XLSX.utils.aoa_to_sheet([
    ['字段', '内容'],
    ['预案标题', run.title],
    ['来源', run.source],
    ['严重度', run.severity],
    ['状态', run.status],
    ['创建时间', run.createdAt],
    ['事件参数摘要', spec.parameterSummary ?? detail.meta?.parameterSummary ?? ''],
    ['参数来源', `电网=${spec.parameterSource?.gridReduction ?? 'none'} / 光伏=${spec.parameterSource?.pvReduction ?? 'none'}`],
    ['优先顺序', detail.priorityOrder.join(' -> ')],
    ['调度说明', run.explanation || detail.explanation],
    [],
    ['关键动作锚点'],
    ...detail.keyAnchors.map((item, index) => [`动作 ${index + 1}`, item]),
  ])

  const pointsSheet = XLSX.utils.json_to_sheet(
    detail.points.map((point) => ({
      index: point.index,
      label: point.label,
      timestamp: point.timestamp,
      P_CA: point.P_CA,
      P_PV: point.P_PV,
      P_GM: point.P_GM,
      P_PEM: point.P_PEM,
      P_G: point.P_G,
      P_es_es: point.P_es_es,
      supplyTotal: point.supplyTotal,
      gap: point.gap,
      riskLevel: point.riskLevel,
    }))
  )

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, descriptionSheet, '预案说明')
  XLSX.utils.book_append_sheet(workbook, pointsSheet, '5分钟点位数据')

  const fileName = `应急预案_${sanitizeFileNamePart(run.title)}_${toExportStamp(run.createdAt)}.xlsx`
  XLSX.writeFile(workbook, fileName)
}
