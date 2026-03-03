/**
 * Agent 模式可执行动作注册表
 * 将 LLM 返回的 tool_calls 映射到实际界面操作
 */

import type { StrategyKey } from '@/types'

export type AgentActionType = 'navigate' | 'switchStrategy'

export interface AgentActionHandlers {
  navigate: (path: string) => void
  switchStrategy: (key: StrategyKey) => void
}

/** 路由路径映射（中文/英文 -> path） */
const PATH_MAP: Record<string, string> = {
  '/': '/overview',
  '总览': '/overview',
  'overview': '/overview',
  '/ca': '/ca',
  '电解槽': '/ca',
  'ca': '/ca',
  '/pv': '/pv',
  '光伏': '/pv',
  'pv': '/pv',
  '/gm': '/gm',
  '燃气轮机': '/gm',
  'gm': '/gm',
  '/pem': '/pem',
  '质子膜燃料电池': '/pem',
  'pem': '/pem',
  '/g': '/g',
  '电网': '/g',
  'g': '/g',
}

/** 策略映射（中文/英文 -> StrategyKey） */
const STRATEGY_MAP: Record<string, StrategyKey> = {
  uci: 'uci',
  '统一控制综合': 'uci',
  '基准方案': 'uci',
  cicos: 'cicos',
  '成本优化': 'cicos',
  '成本优化集成': 'cicos',
  cicar: 'cicar',
  '碳排优化': 'cicar',
  '碳排优化集成': 'cicar',
  cicom: 'cicom',
  '综合优化': 'cicom',
  '综合优化集成': 'cicom',
  pv: 'pv',
  '光伏': 'pv',
  '光伏优先': 'pv',
  '光伏优先优化': 'pv',
  es: 'es',
  '储能': 'es',
  '储能优化': 'es',
  '储能综合优化': 'es',
}

let handlers: AgentActionHandlers | null = null

/**
 * 注册 Agent 动作处理器（由 MainLayout 在挂载时调用）
 */
export function registerAgentHandlers(h: AgentActionHandlers) {
  handlers = h
}

/**
 * 解析并执行 Agent 动作
 * @returns 执行结果描述，用于反馈给 LLM 或用户
 */
export function executeAction(
  type: AgentActionType,
  params: Record<string, unknown>
): { success: boolean; message: string } {
  if (!handlers) {
    return { success: false, message: 'Agent 动作处理器未初始化' }
  }

  try {
    switch (type) {
      case 'navigate': {
        const path = String(params.path ?? '')
        const resolved = PATH_MAP[path] ?? path
        if (resolved.startsWith('/')) {
          handlers.navigate(resolved)
          return { success: true, message: `已切换到页面: ${resolved}` }
        }
        return { success: false, message: `无效路径: ${path}` }
      }
      case 'switchStrategy': {
        const key = String(params.key ?? '').toLowerCase()
        const resolved = STRATEGY_MAP[key] ?? (key as StrategyKey)
        const validKeys: StrategyKey[] = ['uci', 'cicos', 'cicar', 'cicom', 'pv', 'es']
        if (validKeys.includes(resolved)) {
          handlers.switchStrategy(resolved)
          return { success: true, message: `已切换到策略: ${resolved}` }
        }
        return { success: false, message: `无效策略: ${key}` }
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
