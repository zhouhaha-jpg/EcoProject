import type { ParetoData } from '@/context/StrategyContext'
import type { AnomalyRun, DatasetMeta, EcoDataset, EmergencyRun, InvestmentRun, StrategyKey } from '@/types'

export type AgentActionType =
  | 'navigate'
  | 'switchStrategy'
  | 'run_whatif'
  | 'run_emergency_dispatch'
  | 'run_investment_planning'
  | 'run_device_anomaly_dispatch'
  | 'list_emergency_runs'
  | 'apply_emergency_run'
  | 'restore_normal_state'
  | 'add_constraint'
  | 'trace_causality'
  | 'generate_chart'
  | 'pareto_scan'
  | 'get_realtime_data'
  | 'get_alerts'
  | 'carbon_electricity_analysis'

export interface AgentActionHandlers {
  navigate: (path: string) => void
  switchStrategy: (key: StrategyKey) => void
  loadScenarioDataset: (dataset: Record<string, unknown>, label: string) => void
  loadParetoData: (data: ParetoData, label: string) => void
  setEmergencyPreviewRun: (run: EmergencyRun | null) => void
  applyEmergencyRunState: (run: EmergencyRun, dataset?: Record<string, unknown>, meta?: DatasetMeta) => void
  setInvestmentPlan: (run: InvestmentRun | null) => void
  setAnomalyPreviewRun: (run: AnomalyRun | null) => void
  applyAnomalyRunState: (run: AnomalyRun, dataset?: Record<string, unknown>, meta?: DatasetMeta) => void
  restoreNormalDatasetState: (dataset?: Record<string, unknown>, meta?: DatasetMeta) => void
}

const PATH_MAP: Record<string, string> = {
  '/': '/overview',
  overview: '/overview',
  '总览': '/overview',
  '/ca': '/ca',
  ca: '/ca',
  '电解槽': '/ca',
  '/pv': '/pv',
  pv: '/pv',
  '光伏': '/pv',
  '/gm': '/gm',
  gm: '/gm',
  '燃气轮机': '/gm',
  '/pem': '/pem',
  pem: '/pem',
  '/g': '/g',
  g: '/g',
  '电网': '/g',
  '/economic': '/economic',
  '经济指标': '/economic',
  '/storage': '/storage',
  '储能模块': '/storage',
  '/scenario': '/scenario',
  EcoClaw: '/scenario',
  '方案对比': '/scenario',
}

const STRATEGY_MAP: Record<string, StrategyKey> = {
  uci: 'uci',
  cicos: 'cicos',
  cicar: 'cicar',
  cicom: 'cicom',
  pv: 'pv',
  es: 'es',
  '统一控制综合': 'uci',
  '成本优化': 'cicos',
  '碳排优化': 'cicar',
  '综合优化': 'cicom',
  '光伏优先': 'pv',
  '储能优化': 'es',
}

const API_BASE = ''

let handlers: AgentActionHandlers | null = null

export function registerAgentHandlers(nextHandlers: AgentActionHandlers) {
  handlers = nextHandlers
}

export interface AgentExecutionContext {
  fullData: EcoDataset
  datasetMeta?: DatasetMeta
  activeStrategy?: StrategyKey
  emergencyRunId?: number | null
  anomalyRunId?: number | null
}

function requireHandlers(type: string) {
  if (!handlers) {
    throw new Error(`Agent handlers not registered for action: ${type}`)
  }
  return handlers
}

export async function executeAction(
  type: string,
  params: Record<string, unknown>,
  context?: AgentExecutionContext,
): Promise<{ success: boolean; message: string; data?: unknown }> {
  try {
    switch (type as AgentActionType) {
      case 'navigate': {
        const path = String(params.path ?? '')
        const resolved = PATH_MAP[path] ?? path
        if (!resolved.startsWith('/')) return { success: false, message: `无效路径: ${path}` }
        requireHandlers(type).navigate(resolved)
        return { success: true, message: `已切换到页面: ${resolved}` }
      }

      case 'switchStrategy': {
        const key = String(params.key ?? '').toLowerCase()
        const resolved = STRATEGY_MAP[key] ?? (key as StrategyKey)
        if (!['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es'].includes(resolved)) {
          return { success: false, message: `无效策略: ${key}` }
        }
        requireHandlers(type).switchStrategy(resolved)
        return { success: true, message: `已切换到策略: ${resolved}` }
      }

      case 'run_whatif': {
        const desc = String(params.description ?? 'What-If 推演')
        const overrides = (params.params ?? {}) as Record<string, unknown>
        const res = await fetch(`${API_BASE}/api/optimize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ params: overrides, save: true, name: desc }),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const h = requireHandlers(type)
        if (data.summary) {
          h.loadScenarioDataset(data, desc)
          h.navigate('/scenario')
        }
        return { success: true, message: `${desc} 求解完成`, data }
      }

      case 'run_emergency_dispatch': {
        const prompt = String(params.prompt ?? params.description ?? '')
        if (!prompt.trim()) return { success: false, message: '缺少应急场景描述' }
        const res = await fetch(`${API_BASE}/api/emergency/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            eventSpec: { severity: String(params.severity ?? 'critical') },
            baselineDataset: context?.fullData,
            baselineMeta: context?.datasetMeta,
            baselineDatasetId: context?.datasetMeta?.datasetId ?? null,
            activeStrategy: context?.activeStrategy ?? 'es',
            source: 'manual',
          }),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const h = requireHandlers(type)
        h.setEmergencyPreviewRun(data.run)
        h.navigate('/scenario')
        return {
          success: true,
          message: `${data.run?.title ?? '应急预案'} 已生成，可在 EcoClaw 查看并决定是否应用。`,
          data: data.run,
        }
      }

      case 'run_investment_planning': {
        const prompt = String(params.prompt ?? params.description ?? '')
        if (!prompt.trim()) return { success: false, message: '缺少投资规划问题描述' }
        const res = await fetch(`${API_BASE}/api/investment/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            baselineDataset: context?.fullData,
            baselineMeta: context?.datasetMeta,
            baselineDatasetId: context?.datasetMeta?.datasetId ?? null,
            activeStrategy: context?.activeStrategy ?? 'es',
            source: 'manual',
          }),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const h = requireHandlers(type)
        h.setInvestmentPlan(data.run)
        h.navigate('/scenario')
        return {
          success: true,
          message: `${data.run?.title ?? '投资规划'} 已生成，可在 EcoClaw 查看。`,
          data: data.run,
        }
      }

      case 'run_device_anomaly_dispatch': {
        const prompt = String(params.prompt ?? params.description ?? '')
        if (!prompt.trim()) return { success: false, message: '缺少设备异常场景描述' }
        const res = await fetch(`${API_BASE}/api/anomaly/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            eventSpec: {
              severity: String(params.severity ?? 'critical'),
              deviceType: params.device_type ?? undefined,
            },
            baselineDataset: context?.fullData,
            baselineMeta: context?.datasetMeta,
            baselineDatasetId: context?.datasetMeta?.datasetId ?? null,
            activeStrategy: context?.activeStrategy ?? 'es',
            source: 'manual',
          }),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const h = requireHandlers(type)
        h.setAnomalyPreviewRun(data.run)
        h.navigate('/scenario')
        return {
          success: true,
          message: `${data.run?.title ?? '设备异常方案'} 已生成，可在 EcoClaw 查看并决定是否应用。`,
          data: data.run,
        }
      }

      case 'list_emergency_runs': {
        const limitNum = params.limit ? Number(params.limit) : 10
        const res = await fetch(`${API_BASE}/api/emergency/runs?limit=${limitNum}`)
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        return { success: true, message: `获取到 ${Array.isArray(data.data) ? data.data.length : 0} 条应急预案`, data: data.data }
      }

      case 'apply_emergency_run': {
        const runId = Number(params.run_id ?? params.id)
        if (!Number.isFinite(runId)) return { success: false, message: '缺少应急预案 ID' }
        const res = await fetch(`${API_BASE}/api/emergency/runs/${runId}/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const h = requireHandlers(type)
        h.applyEmergencyRunState(data.run, data.dataset?.data, data.dataset?.meta)
        h.navigate('/scenario')
        return { success: true, message: `${data.run?.title ?? `应急预案 ${runId}`} 已应用到全平台展示`, data }
      }

      case 'restore_normal_state': {
        const useAnomaly = Boolean(context?.datasetMeta?.anomalyActive || context?.anomalyRunId)
        const runId = Number(params.run_id ?? (useAnomaly ? context?.anomalyRunId : context?.emergencyRunId) ?? Number.NaN)
        const endpoint = useAnomaly ? '/api/anomaly/restore' : '/api/emergency/restore'
        const res = await fetch(`${API_BASE}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Number.isFinite(runId) ? { runId } : {}),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const h = requireHandlers(type)
        h.restoreNormalDatasetState(data.baselineDataset?.data, data.baselineDataset?.meta)
        if (useAnomaly) {
          h.setAnomalyPreviewRun(data.run ?? null)
        } else {
          h.setEmergencyPreviewRun(data.run ?? null)
        }
        h.navigate('/scenario')
        return { success: true, message: '已恢复到正常展示状态', data }
      }

      case 'add_constraint': {
        const desc = String(params.description ?? '添加约束')
        const constraints = (params.constraints ?? []) as unknown[]
        const res = await fetch(`${API_BASE}/api/optimize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extra_constraints: constraints, save: true, name: desc }),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const h = requireHandlers(type)
        h.loadScenarioDataset(data, desc)
        h.navigate('/scenario')
        return { success: true, message: `${desc} 求解完成`, data }
      }

      case 'trace_causality': {
        const strategy = String(params.strategy ?? 'es') as StrategyKey
        const hour = Math.max(1, Math.min(24, Number(params.hour ?? 1)))
        const idx = hour - 1
        if (!context?.fullData) {
          return { success: true, message: `已获取 ${strategy} 第 ${hour} 小时的分析请求，请基于上下文完成因果分析。`, data: { strategy, hour } }
        }

        const ds = context.fullData
        const lines = [
          `## ${strategy.toUpperCase()} 第 ${hour} 小时设备状态`,
          '',
          `- P_CA: ${ds.P_CA?.[strategy]?.[idx]?.toFixed(0) ?? '-'}`,
          `- P_PV: ${ds.P_PV?.[strategy]?.[idx]?.toFixed(0) ?? '-'}`,
          `- P_GM: ${ds.P_GM?.[strategy]?.[idx]?.toFixed(0) ?? '-'}`,
          `- P_PEM: ${ds.P_PEM?.[strategy]?.[idx]?.toFixed(0) ?? '-'}`,
          `- P_G: ${ds.P_G?.[strategy]?.[idx]?.toFixed(0) ?? '-'}`,
          `- P_es_es: ${ds.P_es_es?.[idx]?.toFixed(0) ?? '-'}`,
          `- H_CA: ${ds.H_CA?.[strategy]?.[idx]?.toFixed(4) ?? '-'}`,
          `- H_PEM: ${ds.H_PEM?.[strategy]?.[idx]?.toFixed(4) ?? '-'}`,
          `- H_HS: ${ds.H_HS?.[strategy]?.[idx]?.toFixed(4) ?? '-'}`,
          `- ef_g: ${ds.ef_g?.[idx]?.toFixed(6) ?? '-'}`,
        ]
        return {
          success: true,
          message: `已获取 ${strategy} 第 ${hour} 小时设备状态数据。`,
          data: { strategy, hour, deviceState: lines.join('\n') },
        }
      }

      case 'generate_chart': {
        return {
          success: true,
          message: `图表配置已生成: ${params.title ?? ''}`,
          data: { chartType: params.chart_type, title: params.title, query: params.data_query },
        }
      }

      case 'pareto_scan': {
        const paramName = String(params.param_name ?? 'n_PV')
        const values = (params.values ?? []) as number[]
        const strategy = String(params.strategy ?? 'cicom')
        const results: Array<{ paramValue: number; cost: number; carbon: number; combined: number }> = []
        for (const value of values) {
          const res = await fetch(`${API_BASE}/api/optimize/single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ strategy, params: { [paramName]: value } }),
          })
          if (!res.ok) continue
          const result = await res.json()
          results.push({ paramValue: value, ...result.summary })
        }
        const paretoPayload: ParetoData = { param_name: paramName, strategy, results }
        const label = `Pareto 扫描: ${paramName} (${Math.min(...values)}-${Math.max(...values)})`
        const h = requireHandlers(type)
        h.loadParetoData(paretoPayload, label)
        h.navigate('/scenario')
        return { success: true, message: `Pareto 扫描完成: ${paramName}`, data: paretoPayload }
      }

      case 'get_realtime_data': {
        const date = params.date ? String(params.date) : undefined
        const url = date
          ? `${API_BASE}/api/realtime/history?date=${encodeURIComponent(date)}`
          : `${API_BASE}/api/realtime/latest`
        const res = await fetch(url)
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        return { success: true, message: `已获取${date ? ` ${date}` : ''}实时数据`, data }
      }

      case 'get_alerts': {
        const severity = params.severity ? String(params.severity) : undefined
        const limitNum = params.limit ? Number(params.limit) : 10
        let url = `${API_BASE}/api/realtime/alerts?limit=${limitNum}`
        if (severity) url += `&severity=${encodeURIComponent(severity)}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        return { success: true, message: `获取到 ${Array.isArray(data) ? data.length : 0} 条预警`, data }
      }

      case 'carbon_electricity_analysis': {
        const res = await fetch(`${API_BASE}/api/realtime/latest`)
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const prices: number[] = data.prices || []
        const carbon: number[] = data.carbon || []
        const carbonPrice = Number(params.carbon_price ?? 70)
        const pEff = prices.map((price, index) => price + (carbon[index] || 0) * carbonPrice)
        const bestIndex = pEff.indexOf(Math.min(...pEff))
        const worstIndex = pEff.indexOf(Math.max(...pEff))
        return {
          success: true,
          message: `碳电协同分析完成: 最优时段 ${bestIndex + 1}h，最差时段 ${worstIndex + 1}h`,
          data: { prices, carbon, p_eff: pEff, best_hour: bestIndex + 1, worst_hour: worstIndex + 1 },
        }
      }

      default:
        return { success: false, message: `未知动作类型: ${type}` }
    }
  } catch (error) {
    return {
      success: false,
      message: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
