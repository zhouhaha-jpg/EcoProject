/**
 * Agent 聊天 Hook：发送消息、流式接收、解析 tool_calls
 */

import { useState, useCallback } from 'react'
import type { AgentContextData } from './useAgentContext'
import { formatContextForLLM } from './useAgentContext'
import { executeAction } from '@/lib/agentActions'

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

export function useAgentChat(ctx: AgentContextData) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<AgentMode>('ask')

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
          await handleJsonResponse(data, mode, setMessages)
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
    [messages, mode, ctx]
  )

  const clearMessages = useCallback(() => {
    setMessages([])
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
  _mode: AgentMode,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
) {
  const msg = data.choices?.[0]?.message
  const content = msg?.content ?? ''
  const toolCalls = msg?.tool_calls ?? []

  const actions: { type: string; params: Record<string, unknown>; result: string }[] = []

  const ASYNC_TOOLS = ['run_whatif', 'add_constraint', 'pareto_scan']

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

    const result = await executeAction(name, params)
    actions.push({ type: name, params, result: result.message })
  }

  const actionText =
    actions.length > 0
      ? actions.map((a) => `已执行：${a.type} → ${a.result}`).join('\n')
      : ''
  const displayContent = [content, actionText].filter(Boolean).join('\n\n') || '已处理您的请求。'

  setMessages((prev) => [
    ...prev,
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: displayContent,
      ...(actions.length > 0 && { actions }),
    },
  ])
}
