/**
 * Agent 聊天 Hook：发送消息、流式接收、解析 tool_calls
 */

import { useState, useCallback } from 'react'
import type { AgentContextData } from './useAgentContext'
import { formatContextForLLM } from './useAgentContext'
import { executeAction } from '@/lib/agentActions'
import type { ExecutionTraceStep, ScenarioFollowupOption } from '@/types'
import {
  createConversation,
  appendConversationMessage,
  updateConversationTitle,
} from '@/lib/api'

/** 开发时为空则走 Vite 代理 /api；生产时需配置 VITE_API_BASE */
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

export type AgentMode = 'ask' | 'agent'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Agent 模式执行的动作及结果 */
  actions?: {
    type: string
    params: Record<string, unknown>
    result: string
    trace?: ExecutionTraceStep[]
    detail?: string
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

export function useAgentChat(ctx: AgentContextData, options?: UseAgentChatOptions) {
  const { conversationId, onConversationCreated, onConversationListChange } = options ?? {}
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<AgentMode>('agent')
  const [toolChain, setToolChain] = useState<ToolChainStep[]>([])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: content.trim(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)
      setError(null)
      setToolChain([{ id: 't0', title: '意图解析', status: 'running', detail: content.trim() }])

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
          const actionPayload = [{
            type: 'continue_scenario_analysis',
            params: { question: content.trim() },
            result: localResult.message,
            trace: localResult.trace,
            detail: localResult.toolContent,
          }]
          if (localResult.trace?.length) setToolChain(localResult.trace)
          const displayContent = localResult.toolContent || localResult.message
          await fakeStreamAssistantMessage(displayContent, actionPayload, setMessages)
          if (cid != null) {
            await appendConversationMessage(cid, {
              role: 'assistant',
              content: displayContent,
              actions: actionPayload,
            })
            onConversationListChange?.()
          }
          return
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setError(msg)
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `抱歉，继续分析失败：${msg}`,
            },
          ])
          return
        } finally {
          setIsLoading(false)
          setToolChain([])
        }
      }

      try {
        /** 开发时为空走 Vite 代理 /api；生产部署时需在 .env 配置 VITE_API_BASE */
        const url = API_BASE ? `${API_BASE}/api/chat` : '/api/chat'
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMsg].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            mode,
            context: contextText,
          }),
        })

        if (!res.ok) {
          const errText = await res.text()
          throw new Error(errText || `HTTP ${res.status}`)
        }

        const contentType = res.headers.get('content-type') ?? ''
        const isStream = contentType.includes('text/event-stream')

        if (isStream) {
          await handleStreamResponse(res, setMessages)
        } else {
          const data = await res.json()
          await handleJsonResponse(data, mode, setMessages, setToolChain, {
            url,
            initialMessages: [...messages, userMsg],
            contextText,
            ctx,
            conversationId: cid,
            onConversationListChange,
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `抱歉，请求失败：${msg}`,
          },
        ])
      } finally {
        setIsLoading(false)
        setToolChain([])
      }
    },
    [messages, mode, ctx, conversationId, onConversationCreated, onConversationListChange]
  )

  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

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
    clearMessages,
    loadMessages,
    toolChain,
  }
}

/** 处理流式响应（Ask 模式） */
async function handleStreamResponse(
  res: Response,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
) {
  const reader = res.body?.getReader()
  const decoder = new TextDecoder()
  if (!reader) throw new Error('No response body')

  const assistantId = crypto.randomUUID()
  let fullText = ''

  setMessages((prev) => [
    ...prev,
    { id: assistantId, role: 'assistant', content: '' },
  ])

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            fullText += delta
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: fullText } : m
              )
            )
          }
        } catch {
          // ignore parse errors for partial chunks
        }
      }
    }
  }
}

function buildActionFallbackContent(actions: NonNullable<ChatMessage['actions']>) {
  return actions
    .map((action) => `已完成 ${action.type}: ${action.result}`)
    .join('\n')
}

function normalizeToolTitle(name: string) {
  switch (name) {
    case 'run_whatif':
      return 'What-if 推演'
    case 'add_constraint':
      return '约束注入'
    case 'plan_next_day_dispatch':
      return '次日计划调度'
    case 'continue_scenario_analysis':
      return '继续分析'
    case 'trace_causality':
      return '因果追溯'
    case 'pareto_scan':
      return 'Pareto 扫描'
    default:
      return name
  }
}

async function fakeStreamAssistantMessage(
  text: string,
  actions: ChatMessage['actions'],
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
) {
  const assistantId = crypto.randomUUID()
  if (!text) {
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', ...(actions ? { actions } : {}) }])
    return
  }

  setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', ...(actions ? { actions } : {}) }])

  const chunkSize = Math.max(16, Math.ceil(text.length / 55))
  let current = ''
  for (let i = 0; i < text.length; i += chunkSize) {
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

interface JsonResponseContext {
  url: string
  initialMessages: ChatMessage[]
  contextText: string
  ctx: AgentContextData
  conversationId?: number | null
  onConversationListChange?: () => void
}

/** 处理 JSON 响应（Agent 模式，含 tool_calls） */
async function handleJsonResponse(
  data: {
    choices?: Array<{
      message?: {
        content?: string
        tool_calls?: Array<{
          id: string
          function?: { name: string; arguments: string }
        }>
      }
    }>
  },
  mode: AgentMode,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setToolChain: React.Dispatch<React.SetStateAction<ToolChainStep[]>>,
  extra?: JsonResponseContext
) {
  const msg = data.choices?.[0]?.message
  let content = msg?.content ?? ''
  const toolCalls = msg?.tool_calls ?? []

  const actions: NonNullable<ChatMessage['actions']> = []
  const toolResults: { id: string; content: string }[] = []

  const NEED_FOLLOWUP_TOOLS = ['run_whatif', 'add_constraint', 'pareto_scan', 'trace_causality', 'plan_next_day_dispatch', 'continue_scenario_analysis']

  if (toolCalls.length > 0) {
    setToolChain(
      toolCalls.map((tc) => ({
        id: tc.id,
        title: normalizeToolTitle(tc.function?.name ?? ''),
        status: 'running' as const,
        detail: '等待工具执行结果',
      }))
    )
  }

  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i]
    const name = tc.function?.name ?? ''
    let params: Record<string, unknown> = {}
    try {
      params = JSON.parse(tc.function?.arguments ?? '{}')
    } catch {
      params = {}
    }

    const agentCtx = extra?.ctx
      ? {
          fullData: extra.ctx.fullData,
          datasetMeta: extra.ctx.datasetMeta,
          activeStrategy: extra.ctx.activeStrategy,
          scenarioDataset: extra.ctx.scenarioDataset,
          scenarioLabel: extra.ctx.scenarioLabel,
          scenarioInsight: extra.ctx.scenarioInsight,
          scenarioTrace: extra.ctx.scenarioTrace,
          emergencyRunId: extra.ctx.emergencyRunId,
          anomalyRunId: extra.ctx.anomalyRunId,
        }
      : undefined
    const result = await executeAction(name, params, agentCtx)
    actions.push({
      type: name,
      params,
      result: result.message,
      trace: result.trace,
      detail: result.toolContent,
    })

    if (result.trace?.length) {
      setToolChain(result.trace)
    } else {
      setToolChain((prev) =>
        prev.map((s) =>
          s.id === tc.id
            ? { ...s, status: result.success ? 'done' as const : 'error' as const, outcome: result.message }
            : s
        )
      )
    }

    const toolContent =
      result.toolContent
        ? result.toolContent
        : name === 'trace_causality' && result.data && typeof result.data === 'object' && 'deviceState' in result.data
        ? String((result.data as { deviceState?: string }).deviceState ?? result.message)
        : result.message
    toolResults.push({ id: tc.id, content: toolContent })
  }

  const hasFollowup = toolCalls.some((tc) => NEED_FOLLOWUP_TOOLS.includes(tc.function?.name ?? ''))

  if (hasFollowup && extra && toolResults.length > 0) {
    const apiMessages = [
      ...extra.initialMessages.map((m) => ({ role: m.role, content: m.content })),
      {
        role: 'assistant',
        content: content || '',
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '{}' },
        })),
      },
      ...toolResults.map((tr) => ({ role: 'tool' as const, tool_call_id: tr.id, content: tr.content })),
    ]

    setToolChain((prev) => [...prev, { id: 't-cont', title: '结论生成', status: 'running', detail: '基于工具结果生成最终分析结论' }])

    try {
      const res2 = await fetch(extra.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          mode,
          context: extra.contextText,
        }),
      })
      if (res2.ok) {
        const contentType = res2.headers.get('content-type') ?? ''
        const isStream = contentType.includes('text/event-stream')
        if (isStream) {
          const assistantId = crypto.randomUUID()
          setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }])
          setToolChain((prev) =>
            prev.map((s) => (s.id === 't-cont' ? { ...s, status: 'done' as const, outcome: '开始输出最终结论' } : s))
          )
          let fullText = ''
          const reader = res2.body?.getReader()
          const decoder = new TextDecoder()
          if (reader) {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              const chunk = decoder.decode(value, { stream: true })
              const lines = chunk.split('\n')
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const dataStr = line.slice(6)
                  if (dataStr === '[DONE]') continue
                  try {
                    const parsed = JSON.parse(dataStr)
                    const delta = parsed.choices?.[0]?.delta?.content
                    if (delta) {
                      fullText += delta
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === assistantId ? { ...m, content: fullText } : m
                        )
                      )
                    }
                  } catch {
                    /* ignore */
                  }
                }
              }
            }
          }
          content = fullText
          const displayContent = content || (actions.length > 0 ? buildActionFallbackContent(actions) : '已处理您的请求。')
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: displayContent, actions } : m
            )
          )
          if (extra.conversationId) {
            appendConversationMessage(extra.conversationId, {
              role: 'assistant',
              content: displayContent,
              actions: actions.length > 0 ? actions : undefined,
            }).then(() => extra.onConversationListChange?.()).catch(() => {})
          }
        } else {
          const data2 = await res2.json()
          const msg2 = data2.choices?.[0]?.message
          const finalContent = msg2?.content ?? ''
          if (finalContent) content = finalContent
          setToolChain((prev) =>
            prev.map((s) => (s.id === 't-cont' ? { ...s, status: 'done' as const, outcome: '最终结论已生成' } : s))
          )
          const displayContent = content || (actions.length > 0 ? buildActionFallbackContent(actions) : '已处理您的请求。')
          await fakeStreamAssistantMessage(displayContent, actions.length > 0 ? actions : undefined, setMessages)
          if (extra.conversationId) {
            appendConversationMessage(extra.conversationId, {
              role: 'assistant',
              content: displayContent,
              actions: actions.length > 0 ? actions : undefined,
            }).then(() => extra.onConversationListChange?.()).catch(() => {})
          }
        }
      }
    } catch {
      setToolChain((prev) =>
        prev.map((s) => (s.id === 't-cont' ? { ...s, status: 'error' as const, outcome: '结论回灌失败，保留工具执行结果' } : s))
      )
    }
  }

  if (!hasFollowup || !extra || toolResults.length === 0) {
    const displayContent = content || (actions.length > 0 ? buildActionFallbackContent(actions) : '已处理您的请求。')
    await fakeStreamAssistantMessage(displayContent, actions.length > 0 ? actions : undefined, setMessages)

    if (extra?.conversationId) {
      appendConversationMessage(extra.conversationId, {
        role: 'assistant',
        content: displayContent,
        actions: actions.length > 0 ? actions : undefined,
      }).then(() => extra.onConversationListChange?.()).catch(() => {})
    }
  }
}
