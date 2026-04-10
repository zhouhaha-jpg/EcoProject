/**
 * Agent 聊天 Hook：发送消息、流式接收 thinking/content/tool_calls
 */

import { useState, useCallback, useRef } from 'react'
import type { AgentContextData } from './useAgentContext'
import { formatContextForLLM } from './useAgentContext'
import { executeAction } from '@/lib/agentActions'
import type { ExecutionTraceStep, ScenarioFollowupOption } from '@/types'
import {
  createConversation,
  appendConversationMessage,
  updateConversationTitle,
  type ConversationWorkspaceState,
} from '@/lib/api'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

export type AgentMode = 'ask' | 'agent'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  actions?: {
    type: string
    params: Record<string, unknown>
    result: string
    trace?: ExecutionTraceStep[]
    detail?: string
    workspaceState?: ConversationWorkspaceState
  }[]
}

export interface ToolChainStep {
  id: string
  title: string
  status: 'pending' | 'running' | 'done' | 'error'
  detail?: string
  outcome?: string
}

export interface UseAgentChatOptions {
  conversationId: number | null
  onConversationCreated?: (id: number) => void
  onConversationListChange?: () => void
}

// ── 工具名称中文映射 ──────────────────────────────────────────

function normalizeToolTitle(name: string) {
  const MAP: Record<string, string> = {
    navigate: '页面导航',
    switchStrategy: '切换策略',
    run_whatif: 'What-If 推演',
    run_emergency_dispatch: '应急调度',
    plan_next_day_dispatch: '次日计划调度',
    run_investment_planning: '投资建设规划',
    run_device_anomaly_dispatch: '设备异常指挥',
    list_emergency_runs: '查看应急预案',
    apply_emergency_run: '应用应急预案',
    restore_normal_state: '恢复正常状态',
    add_constraint: '约束注入',
    continue_scenario_analysis: '继续分析',
    trace_causality: '因果追溯',
    generate_chart: '图表生成',
    pareto_scan: 'Pareto 参数扫描',
    get_realtime_data: '获取实时数据',
    get_alerts: '获取预警事件',
    carbon_electricity_analysis: '碳电协同分析',
  }
  return MAP[name] || name
}

// ── 工具执行中间阶段 ──────────────────────────────────────────

const TOOL_STAGES: Record<string, Array<{ title: string; detail: string }>> = {
  plan_next_day_dispatch: [
    { title: '可行性检查', detail: '沿用当前实时电价、碳因子和基线设备边界' },
    { title: '优化求解', detail: '调用多策略调度优化器，重算 6 套策略' },
    { title: '差异归因', detail: '对比各策略指标变化，分析最优方案' },
    { title: '调度建议', detail: '生成设备调度曲线与运行建议' },
  ],
  run_whatif: [
    { title: '约束注入', detail: '注入 What-If 场景参数到优化模型' },
    { title: '优化求解', detail: '调用多策略调度优化器，重算 6 套策略' },
    { title: '差异归因', detail: '对比场景前后各策略指标变化' },
  ],
  add_constraint: [
    { title: '约束验证', detail: '校验约束参数合法性' },
    { title: '参数注入', detail: '注入新约束到优化模型' },
    { title: '优化求解', detail: '在新约束下重新求解' },
  ],
  pareto_scan: [
    { title: '参数空间划分', detail: '离散化扫描区间' },
    { title: 'Pareto 前沿计算', detail: '遍历参数点计算成本-碳排权衡' },
  ],
  trace_causality: [
    { title: '数据溯源', detail: '回溯设备状态与调度决策' },
    { title: '因果链分析', detail: '关联电价、天气与调度结果' },
  ],
  run_emergency_dispatch: [
    { title: '场景评估', detail: '评估应急事件影响范围' },
    { title: '应急方案生成', detail: '生成应急调度策略与恢复路径' },
  ],
  run_device_anomaly_dispatch: [
    { title: '异常诊断', detail: '分析设备异常类型与影响' },
    { title: '指挥方案生成', detail: '生成异常处置与补偿策略' },
  ],
  run_investment_planning: [
    { title: '投资模型计算', detail: 'PV ROI 与设备扩容建模' },
    { title: '报告生成', detail: '生成投资回报分析报告' },
  ],
  continue_scenario_analysis: [
    { title: '上下文加载', detail: '加载当前场景数据与历史分析' },
    { title: '深度分析', detail: '基于追问方向进行进一步计算' },
  ],
}

// ── SSE 流解析 ────────────────────────────────────────────────

interface ToolCallAccum {
  id: string
  function: { name: string; arguments: string }
}

interface SSEResult {
  content: string
  thinking: string
  toolCalls: ToolCallAccum[]
}

async function readSSE(
  res: Response,
  callbacks: {
    onThinking?: (chunk: string) => void
    onContent?: (chunk: string) => void
    onError?: (msg: string) => void
  },
): Promise<SSEResult> {
  const reader = res.body?.getReader()
  const decoder = new TextDecoder()
  if (!reader) throw new Error('No response body')

  let content = ''
  let thinking = ''
  const accToolCalls: Record<number, { id: string; name: string; args: string }> = {}
  let sseBuffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      sseBuffer += decoder.decode(value, { stream: true })
      const lines = sseBuffer.split('\n')
      sseBuffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6)
        if (raw === '[DONE]') continue

        try {
          const ev = JSON.parse(raw)

          if (ev.type === 'thinking') {
            thinking += ev.text
            callbacks.onThinking?.(ev.text)
          } else if (ev.type === 'content') {
            content += ev.text
            callbacks.onContent?.(ev.text)
          } else if (ev.type === 'tool_calls') {
            for (const tc of (ev.tool_calls || [])) {
              const idx = Object.keys(accToolCalls).length
              accToolCalls[idx] = { id: tc.id, name: tc.function?.name || '', args: tc.function?.arguments || '' }
            }
          } else if (ev.type === 'error') {
            callbacks.onError?.(ev.error || 'Unknown error')
          } else if (ev.choices?.[0]?.delta?.content) {
            const delta = ev.choices[0].delta.content
            content += delta
            callbacks.onContent?.(delta)
          }
        } catch { /* partial JSON, skip */ }
      }
    }
  } finally {
    reader.releaseLock()
  }

  const toolCalls = Object.values(accToolCalls)
    .filter((tc) => tc.id && tc.name)
    .map((tc) => ({ id: tc.id, function: { name: tc.name, arguments: tc.args } }))

  return { content, thinking, toolCalls }
}

// ── Hook ──────────────────────────────────────────────────────

export function useAgentChat(ctx: AgentContextData, options?: UseAgentChatOptions) {
  const { conversationId, onConversationCreated, onConversationListChange } = options ?? {}
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<AgentMode>('agent')
  const [toolChain, setToolChain] = useState<ToolChainStep[]>([])
  const [thinkingText, setThinkingText] = useState('')
  const [thinkingDuration, setThinkingDuration] = useState(0)
  const thinkingTimerRef = useRef<number | null>(null)
  const thinkingStartRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const activeRunRef = useRef<{ id: number; stopped: boolean }>({ id: 0, stopped: true })
  const activeAssistantIdRef = useRef<string | null>(null)

  const startThinkingTimer = useCallback(() => {
    if (thinkingTimerRef.current != null) return
    thinkingStartRef.current = Date.now()
    const tick = () => {
      setThinkingDuration(Math.round((Date.now() - thinkingStartRef.current) / 100) / 10)
      thinkingTimerRef.current = window.requestAnimationFrame(tick)
    }
    thinkingTimerRef.current = window.requestAnimationFrame(tick)
  }, [])

  const stopThinkingTimer = useCallback(() => {
    if (thinkingTimerRef.current != null) {
      window.cancelAnimationFrame(thinkingTimerRef.current)
      thinkingTimerRef.current = null
    }
    if (thinkingStartRef.current > 0) {
      setThinkingDuration(Math.round((Date.now() - thinkingStartRef.current) / 100) / 10)
    }
  }, [])

  const isAbortError = (value: unknown) =>
    value instanceof Error && value.name === 'AbortError'

  const isRunActive = useCallback((runId: number) => {
    return activeRunRef.current.id === runId && !activeRunRef.current.stopped
  }, [])

  const removeEmptyStreamingMessage = useCallback((assistantId: string | null) => {
    if (!assistantId) return
    setMessages((prev) =>
      prev.filter((message) =>
        !(message.id === assistantId && message.role === 'assistant' && !message.content && !(message.actions?.length)),
      ),
    )
  }, [])

  const finalizeRun = useCallback((runId: number) => {
    if (activeRunRef.current.id !== runId) return
    activeRunRef.current = { id: runId, stopped: true }
    abortControllerRef.current = null
    activeAssistantIdRef.current = null
    setIsLoading(false)
    setToolChain([])
    stopThinkingTimer()
  }, [stopThinkingTimer])

  const stopMessage = useCallback(() => {
    const active = activeRunRef.current
    if (!active.id || active.stopped) return

    activeRunRef.current = { ...active, stopped: true }
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    removeEmptyStreamingMessage(activeAssistantIdRef.current)
    activeAssistantIdRef.current = null
    setIsLoading(false)
    setToolChain([])
    setError(null)
    stopThinkingTimer()
  }, [removeEmptyStreamingMessage, stopThinkingTimer])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return

      const runId = activeRunRef.current.id + 1
      activeRunRef.current = { id: runId, stopped: false }
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      activeAssistantIdRef.current = null

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: content.trim(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)
      setError(null)
      setToolChain([])
      setThinkingText('')
      setThinkingDuration(0)

      let cid = conversationId ?? null
      try {
        if (cid == null) {
          cid = await createConversation(mode)
          onConversationCreated?.(cid)
          onConversationListChange?.()
        }
        await appendConversationMessage(cid!, { role: 'user', content: userMsg.content })
        if (messages.length === 0) {
          const title = content.trim().length > 24 ? content.trim().slice(0, 24) + '…' : content.trim()
          updateConversationTitle(cid!, title || '新对话').catch(() => {})
        }
      } catch (e) {
        if (isAbortError(e) || !isRunActive(runId)) return
        console.warn('[persist]', e)
      }

      const contextText = formatContextForLLM(ctx)
      const agentCtx = {
        fullData: ctx.fullData,
        datasetMeta: ctx.datasetMeta,
        activeStrategy: ctx.activeStrategy,
        scenarioDataset: ctx.scenarioDataset,
        scenarioLabel: ctx.scenarioLabel,
        scenarioInsight: ctx.scenarioInsight,
        scenarioTrace: ctx.scenarioTrace,
        emergencyRunId: ctx.emergencyRunId,
        anomalyRunId: ctx.anomalyRunId,
      }

      const matchedFollowupOption = findScenarioFollowupOption(content.trim(), ctx.scenarioInsight?.followupOptions)
      if (mode === 'agent' && ctx.currentPage === '/scenario' && ctx.scenarioDataset && (matchedFollowupOption || isScenarioFollowupQuestion(content.trim()))) {
        try {
          const localResult = await executeAction('continue_scenario_analysis', { question: content.trim() }, agentCtx)
          if (!isRunActive(runId)) return
          const actionPayload = [{
            type: 'continue_scenario_analysis',
            params: { question: content.trim() },
            result: localResult.message,
            trace: localResult.trace,
            detail: localResult.toolContent,
            workspaceState: buildScenarioWorkspaceStateFromResult(localResult),
          }]
          if (localResult.trace?.length) setToolChain(localResult.trace)
          const displayContent = localResult.toolContent || localResult.message
          await fakeStreamAssistantMessage(displayContent, actionPayload, setMessages, () => isRunActive(runId), activeAssistantIdRef)
          if (cid != null && isRunActive(runId)) {
            await appendConversationMessage(cid, {
              role: 'assistant',
              content: displayContent,
              actions: actionPayload,
            })
            onConversationListChange?.()
          }
          return
        } catch (e) {
          if (isAbortError(e) || !isRunActive(runId)) return
          const msg = e instanceof Error ? e.message : String(e)
          setError(msg)
          setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `抱歉，继续分析失败：${msg}` }])
          return
        } finally {
          finalizeRun(runId)
        }
      }

      try {
        const url = API_BASE ? `${API_BASE}/api/chat` : '/api/chat'
        const controller = new AbortController()
        abortControllerRef.current = controller
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
            mode,
            context: contextText,
          }),
        })
        if (!isRunActive(runId)) return

        if (!res.ok && !res.headers.get('content-type')?.includes('text/event-stream')) {
          const errText = await res.text()
          throw new Error(errText || `HTTP ${res.status}`)
        }

        const assistantId = crypto.randomUUID()
        activeAssistantIdRef.current = assistantId
        setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }])

        let thinkingStarted = false
        const sseResult = await readSSE(res, {
          onThinking: (chunk) => {
            if (!isRunActive(runId)) return
            if (!thinkingStarted) {
              thinkingStarted = true
              startThinkingTimer()
            }
            setThinkingText((prev) => prev + chunk)
          },
          onContent: (chunk) => {
            if (!isRunActive(runId)) return
            setMessages((prev) => {
              const last = prev.find((m) => m.id === assistantId)
              const cur = (last?.content ?? '') + chunk
              return prev.map((m) => m.id === assistantId ? { ...m, content: cur } : m)
            })
          },
          onError: (msg) => {
            if (!isRunActive(runId)) return
            setError(msg)
          },
        })
        if (!isRunActive(runId)) return

        let allThinking = sseResult.thinking

        if (sseResult.toolCalls.length > 0) {
          const toolCalls = sseResult.toolCalls

          const NEED_FOLLOWUP_TOOLS = ['run_whatif', 'add_constraint', 'pareto_scan', 'trace_causality', 'plan_next_day_dispatch', 'continue_scenario_analysis']
          const actions: NonNullable<ChatMessage['actions']> = []
          const toolResults: { id: string; content: string }[] = []

          for (const tc of toolCalls) {
            if (!isRunActive(runId)) return
            let params: Record<string, unknown> = {}
            try { params = JSON.parse(tc.function.arguments || '{}') } catch { params = {} }

            const paramDesc = Object.entries(params).map(([k, v]) => `${k}: ${v}`).join('；').slice(0, 80) || tc.function.arguments.slice(0, 60)

            setToolChain([
              { id: 'step-intent', title: '意图解析', status: 'done' as const, detail: sseResult.content?.slice(0, 60) || `调用 ${normalizeToolTitle(tc.function.name)}` },
              { id: 'step-params', title: '参数映射', status: 'done' as const, detail: paramDesc },
            ])

            const stages = TOOL_STAGES[tc.function.name] || []
            let stageIdx = 0
            const stageTimer = stages.length > 0
              ? setInterval(() => {
                  if (!isRunActive(runId)) return
                  if (stageIdx < stages.length) {
                    const stage = stages[stageIdx]
                    setToolChain((prev) => {
                      const updated = prev.map((s) =>
                        s.id.startsWith('stage-') && s.status === 'running' ? { ...s, status: 'done' as const } : s,
                      )
                      return [...updated, { id: `stage-${stageIdx}`, title: stage.title, status: 'running' as const, detail: stage.detail }]
                    })
                    stageIdx++
                  }
                }, 1800)
              : null

            const result = await executeAction(tc.function.name, params, agentCtx)
            if (stageTimer) clearInterval(stageTimer)
            if (!isRunActive(runId)) return

            setToolChain((prev) => {
              let updated = prev.map((s) =>
                s.status === 'running' ? { ...s, status: 'done' as const } : s,
              )
              if (result.trace?.length) {
                const shown = new Set(updated.map((s) => s.title))
                const extra = result.trace
                  .filter((s) => !shown.has(s.title))
                  .map((s) => ({ ...s, status: 'done' as ToolChainStep['status'] }))
                updated = [...updated, ...extra]
              }
              return updated
            })

            actions.push({
              type: tc.function.name,
              params,
              result: result.message,
              trace: result.trace,
              detail: result.toolContent,
              workspaceState: buildScenarioWorkspaceStateFromResult(result),
            })

            const toolContent =
              result.toolContent
                ? result.toolContent
                : tc.function.name === 'trace_causality' && result.data && typeof result.data === 'object' && 'deviceState' in result.data
                  ? String((result.data as { deviceState?: string }).deviceState ?? result.message)
                  : result.message
            toolResults.push({ id: tc.id, content: toolContent })
          }

          const hasFollowup = toolCalls.some((tc) => NEED_FOLLOWUP_TOOLS.includes(tc.function.name))

          if (hasFollowup && toolResults.length > 0) {
            setToolChain((prev) => [...prev, { id: 't-cont', title: '结论生成', status: 'running', detail: '基于工具结果生成分析结论' }])

            const apiMessages = [
              ...[...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
              {
                role: 'assistant',
                content: sseResult.content || '',
                tool_calls: toolCalls.map((tc) => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: { name: tc.function.name, arguments: tc.function.arguments },
                })),
              },
              ...toolResults.map((tr) => ({ role: 'tool' as const, tool_call_id: tr.id, content: tr.content })),
            ]

            try {
              const followupController = new AbortController()
              abortControllerRef.current = followupController
              const res2 = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: followupController.signal,
                body: JSON.stringify({ messages: apiMessages, mode, context: contextText }),
              })
              if (!isRunActive(runId)) return

              if (res2.ok) {
                const followup = await readSSE(res2, {
                  onThinking: (chunk) => {
                    if (!isRunActive(runId)) return
                    allThinking += chunk
                    setThinkingText((prev) => prev + chunk)
                  },
                  onContent: (chunk) => {
                    if (!isRunActive(runId)) return
                    setMessages((prev) => {
                      const last = prev.find((m) => m.id === assistantId)
                      const cur = (last?.content ?? '') + chunk
                      return prev.map((m) => m.id === assistantId ? { ...m, content: cur } : m)
                    })
                  },
                })
                if (!isRunActive(runId)) return

                setToolChain((prev) =>
                  prev.map((s) => s.id === 't-cont' ? { ...s, status: 'done' as const } : s),
                )

                const displayContent = followup.content || sseResult.content || buildActionFallbackContent(actions)
                setMessages((prev) =>
                  prev.map((m) => m.id === assistantId ? { ...m, content: displayContent, actions, thinking: allThinking || undefined } : m),
                )
                if (cid != null) {
                  appendConversationMessage(cid, { role: 'assistant', content: displayContent, actions }).then(() => onConversationListChange?.()).catch(() => {})
                }
              }
            } catch (e) {
              if (isAbortError(e) || !isRunActive(runId)) return
              setToolChain((prev) =>
                prev.map((s) => s.id === 't-cont' ? { ...s, status: 'error' as const, outcome: '结论回灌失败' } : s),
              )
              const fallback = sseResult.content || buildActionFallbackContent(actions)
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId ? { ...m, content: fallback, actions, thinking: allThinking || undefined } : m),
              )
              if (cid != null) {
                appendConversationMessage(cid, { role: 'assistant', content: fallback, actions }).catch(() => {})
              }
            }
          } else {
            const displayContent = sseResult.content || buildActionFallbackContent(actions)
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, content: displayContent, actions, thinking: allThinking || undefined } : m),
            )
            if (cid != null) {
              appendConversationMessage(cid, { role: 'assistant', content: displayContent, actions: actions.length > 0 ? actions : undefined }).then(() => onConversationListChange?.()).catch(() => {})
            }
          }
        } else {
          const finalContent = sseResult.content || '已处理您的请求。'
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, content: finalContent, thinking: allThinking || undefined } : m),
          )
          if (cid != null) {
            appendConversationMessage(cid, { role: 'assistant', content: finalContent }).then(() => onConversationListChange?.()).catch(() => {})
          }
        }
      } catch (e) {
        if (isAbortError(e) || !isRunActive(runId)) return
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `抱歉，请求失败：${msg}` }])
      } finally {
        finalizeRun(runId)
      }
    },
    [messages, mode, ctx, conversationId, onConversationCreated, onConversationListChange, isLoading, startThinkingTimer, isRunActive, finalizeRun],
  )

  const clearMessages = useCallback(() => {
    stopMessage()
    setMessages([])
    setError(null)
    setThinkingText('')
    setThinkingDuration(0)
  }, [stopMessage])

  const loadMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs)
    setError(null)
  }, [])

  return {
    messages,
    isLoading,
    error,
    mode,
    setMode,
    sendMessage,
    stopMessage,
    clearMessages,
    loadMessages,
    toolChain,
    thinkingText,
    thinkingDuration,
  }
}

// ── 辅助函数 ──────────────────────────────────────────────────

function buildActionFallbackContent(actions: NonNullable<ChatMessage['actions']>) {
  return actions
    .map((action) => `已完成 ${normalizeToolTitle(action.type)}: ${action.result}`)
    .join('\n')
}

function buildScenarioWorkspaceStateFromResult(result: { data?: unknown }): ConversationWorkspaceState | undefined {
  const payload = result?.data
  if (!payload || typeof payload !== 'object') return undefined

  const scenarioPayload = payload as {
    dataset?: Record<string, unknown>
    label?: string
    insight?: AgentContextData['scenarioInsight']
    trace?: ExecutionTraceStep[]
  }

  if (!scenarioPayload.dataset || typeof scenarioPayload.label !== 'string') return undefined

  return {
    pageType: 'scenario',
    route: '/scenario',
    scenarioPayload: {
      dataset: scenarioPayload.dataset,
      label: scenarioPayload.label,
      insight: scenarioPayload.insight ?? null,
      trace: scenarioPayload.trace ?? [],
    },
    savedAt: new Date().toISOString(),
  }
}

async function fakeStreamAssistantMessage(
  text: string,
  actions: ChatMessage['actions'],
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  shouldContinue?: () => boolean,
  assistantIdRef?: React.MutableRefObject<string | null>,
) {
  const assistantId = crypto.randomUUID()
  if (assistantIdRef) assistantIdRef.current = assistantId
  if (!text) {
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', ...(actions ? { actions } : {}) }])
    return
  }

  setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', ...(actions ? { actions } : {}) }])

  const chunkSize = Math.max(16, Math.ceil(text.length / 55))
  let current = ''
  for (let i = 0; i < text.length; i += chunkSize) {
    if (shouldContinue && !shouldContinue()) return
    current += text.slice(i, i + chunkSize)
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId ? { ...message, content: current, ...(actions ? { actions } : {}) } : message,
      ),
    )
    await new Promise((resolve) => window.setTimeout(resolve, 18))
  }
}

function isScenarioFollowupQuestion(content: string) {
  const normalized = content.replace(/\s+/g, '')
  return normalized.includes('继续分析')
    || (normalized.includes('为什么') && normalized.includes('最优策略'))
    || (normalized.includes('哪几个时段') && (normalized.includes('购电') || normalized.includes('电网')) && normalized.includes('压力最大'))
    || normalized.includes('补偿')
    || normalized.includes('压低10%')
}

function findScenarioFollowupOption(content: string, options?: ScenarioFollowupOption[] | null) {
  if (!Array.isArray(options) || options.length === 0) return null
  const normalized = content.trim()
  return options.find((option) => option.label === normalized || option.question === normalized) ?? null
}
