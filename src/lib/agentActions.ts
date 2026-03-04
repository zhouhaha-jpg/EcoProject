/**
 * Agent 模式可执行动作注册表
 * 将 LLM 返回的 tool_calls 映射到实际界面操作
 */

import type { StrategyKey } from '@/types'

export type AgentActionType =
  | 'navigate'
  | 'switchStrategy'
  | 'run_whatif'
  | 'add_constraint'
  | 'trace_causality'
  | 'generate_chart'
  | 'pareto_scan'

export interface AgentActionHandlers {
  navigate: (path: string) => void
  switchStrategy: (key: StrategyKey) => void
  loadScenarioDataset: (dataset: Record<string, unknown>, label: string) => void
}

const PATH_MAP: Record<string, string> = {
  '/': '/overview', '总览': '/overview', 'overview': '/overview',
  '/ca': '/ca', '电解槽': '/ca', 'ca': '/ca',
  '/pv': '/pv', '光伏': '/pv', 'pv': '/pv',
  '/gm': '/gm', '燃气轮机': '/gm', 'gm': '/gm',
  '/pem': '/pem', '质子膜燃料电池': '/pem', 'pem': '/pem',
  '/g': '/g', '电网': '/g', 'g': '/g',
  '/economic': '/economic', '经济指标': '/economic',
  '/storage': '/storage', '存储模块': '/storage',
  '/scenario': '/scenario', '方案对比': '/scenario',
}

const STRATEGY_MAP: Record<string, StrategyKey> = {
  uci: 'uci', '统一控制综合': 'uci', '基准方案': 'uci',
  cicos: 'cicos', '成本优化': 'cicos', '成本优化集成': 'cicos',
  cicar: 'cicar', '碳排优化': 'cicar', '碳排优化集成': 'cicar',
  cicom: 'cicom', '综合优化': 'cicom', '综合优化集成': 'cicom',
  pv: 'pv', '光伏优先': 'pv', '光伏优先优化': 'pv',
  es: 'es', '储能': 'es', '储能优化': 'es', '储能综合优化': 'es',
}

const API_BASE = ''

let handlers: AgentActionHandlers | null = null

export function registerAgentHandlers(h: AgentActionHandlers) {
  handlers = h
}

/**
 * Execute an agent action. Async tools (run_whatif, pareto_scan, etc.) call the
 * backend optimizer and may take 10-60 seconds.
 */
export async function executeAction(
  type: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; message: string; data?: unknown }> {
  if (!handlers && ['navigate', 'switchStrategy', 'run_whatif', 'add_constraint'].includes(type)) {
    if (!handlers) return { success: false, message: 'Agent 动作处理器未初始化' }
  }

  try {
    switch (type) {
      case 'navigate': {
        const path = String(params.path ?? '')
        const resolved = PATH_MAP[path] ?? path
        if (resolved.startsWith('/')) {
          handlers!.navigate(resolved)
          return { success: true, message: `已切换到页面: ${resolved}` }
        }
        return { success: false, message: `无效路径: ${path}` }
      }

      case 'switchStrategy': {
        const key = String(params.key ?? '').toLowerCase()
        const resolved = STRATEGY_MAP[key] ?? (key as StrategyKey)
        const valid: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']
        if (valid.includes(resolved)) {
          handlers!.switchStrategy(resolved)
          return { success: true, message: `已切换到策略: ${resolved}` }
        }
        return { success: false, message: `无效策略: ${key}` }
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
        if (handlers && data.summary) {
          handlers.loadScenarioDataset(data, desc)
        }
        const summaryES = data.summary?.es
        const msg = summaryES
          ? `${desc} 求解完成。ES方案: 成本=${summaryES.cost}元, 碳排=${summaryES.carbon}tCO2, 综合=${summaryES.combined}`
          : `${desc} 求解完成`
        return { success: true, message: msg, data }
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
        if (handlers && data.summary) {
          handlers.loadScenarioDataset(data, desc)
        }
        return { success: true, message: `${desc} 求解完成`, data }
      }

      case 'trace_causality': {
        const strategy = String(params.strategy ?? 'es')
        const hour = Number(params.hour ?? 1)
        return {
          success: true,
          message: `已获取 ${strategy} 方案第 ${hour} 时段的设备状态数据，请基于上下文中的完整数据进行因果分析。`,
          data: { strategy, hour },
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
        for (const val of values) {
          const res = await fetch(`${API_BASE}/api/optimize/single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ strategy, params: { [paramName]: val } }),
          })
          if (res.ok) {
            const r = await res.json()
            results.push({ paramValue: val, ...r.summary })
          }
        }
        return {
          success: true,
          message: `Pareto 扫描完成: ${paramName} 取 ${values.length} 个值，策略=${strategy}`,
          data: { param_name: paramName, results },
        }
      }

      default:
        return { success: false, message: `未知动作类型: ${type}` }
    }
  } catch (e) {
    return {
      success: false,
      message: `执行失败: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}
