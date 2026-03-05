/**
 * Agent 聊天 Hook：发送消息、流式接收、解析 tool_calls
 */

import { useState, useCallback } from 'react'
import type { AgentContextData } from './useAgentContext'
import { formatContextForLLM } from './useAgentContext'
import { executeAction } from '@/lib/agentActions'
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
  actions?: { type: string; params: Record<string, unknown>; result: string }[]
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
          await handleJsonResponse(data, mode, setMessages, {
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

interface JsonResponseContext {
  url: string
  initialMessages: ChatMessage[]
  contextText: string
  ctx: AgentContextData
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
  extra?: JsonResponseContext
) {
  const msg = data.choices?.[0]?.message
  let content = msg?.content ?? ''
  const toolCalls = msg?.tool_calls ?? []

  const actions: { type: string; params: Record<string, unknown>; result: string }[] = []
  const toolResults: { id: string; content: string }[] = []

  const ASYNC_TOOLS = ['run_whatif', 'add_constraint', 'pareto_scan']
  const NEED_FOLLOWUP_TOOLS = ['trace_causality']

  for (const tc of toolCalls) {
    const name = tc.function?.name ?? ''
    let params: Record<string, unknown> = {}
    try {
      params = JSON.parse(tc.function?.arguments ?? '{}')
    } catch {
      params = {}
    }

    if (ASYNC_TOOLS.includes(name)) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `正在执行 ${name}，优化求解中，请稍候（约10-60秒）...`,
        },
      ])
    }

    const traceCtx = name === 'trace_causality' && extra?.ctx
      ? { fullData: extra.ctx.fullData }
      : undefined
    const result = await executeAction(name, params, traceCtx)
    actions.push({ type: name, params, result: result.message })

    const toolContent =
      name === 'trace_causality' && result.data && typeof result.data === 'object' && 'deviceState' in result.data
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
        const data2 = await res2.json()
        const msg2 = data2.choices?.[0]?.message
        const finalContent = msg2?.content ?? ''
        if (finalContent) {
          content = finalContent
        }
      }
    } catch {
      // 第二轮请求失败时保留已执行动作的展示
    }
  }

  const actionText =
    actions.length > 0
      ? actions.map((a) => `已执行：${a.type} → ${a.result}`).join('\n')
      : ''
  const displayContent = [content, actionText].filter(Boolean).join('\n\n') || '已处理您的请求。'

  const assistantMsg = {
    id: crypto.randomUUID(),
    role: 'assistant' as const,
    content: displayContent,
    ...(actions.length > 0 && { actions }),
  }
  setMessages((prev) => [...prev, assistantMsg])

  if (extra?.conversationId) {
    appendConversationMessage(extra.conversationId, {
      role: 'assistant',
      content: displayContent,
      actions: actions.length > 0 ? actions : undefined,
    }).then(() => extra.onConversationListChange?.()).catch(() => {})
  }
}
