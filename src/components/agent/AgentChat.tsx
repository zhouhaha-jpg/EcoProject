/**
 * Agent 聊天：消息列表 + 输入框 + 工具链展示
 */

import { useRef, useEffect, useState } from 'react'
import type { ChatMessage, ToolChainStep } from '@/hooks/useAgentChat'
import AgentModeSwitch from './AgentModeSwitch'
import { Send, Trash2, User, Bot, ChevronDown, ChevronUp } from 'lucide-react'

interface AgentChatProps {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  mode: 'ask' | 'agent'
  onModeChange: (mode: 'ask' | 'agent') => void
  onSend: (content: string) => void
  onClear: () => void
  toolChain?: ToolChainStep[]
}

export default function AgentChat({
  messages,
  isLoading,
  error,
  mode,
  onModeChange,
  onSend,
  onClear,
  toolChain = [],
}: AgentChatProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [thinkingExpanded, setThinkingExpanded] = useState(false)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleSubmit = () => {
    const text = inputRef.current?.value?.trim()
    if (!text || isLoading) return
    onSend(text)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 头部：模式切换 + 清空 */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-[#1e3256]">
        <AgentModeSwitch mode={mode} onChange={onModeChange} disabled={isLoading} />
        <button
          type="button"
          onClick={onClear}
          className="p-1.5 text-[#3d6080] hover:text-[#8ba9cc] rounded transition-colors"
          title="清空对话"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* 消息列表 */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0 relative"
      >
        {messages.length === 0 && (
          <div className="text-center py-8 text-[#3d6080] text-xs">
            <p className="mb-2">
              {mode === 'ask'
                ? '基于当前数据提问，例如：'
                : '直接下达指令，例如：'}
            </p>
            <ul className="text-left max-w-[260px] mx-auto space-y-1">
              {mode === 'ask' ? (
                <>
                  <li>• 哪个方案成本最低？</li>
                  <li>• PV 和 ES 的碳排差多少？</li>
                  <li>• 为什么 ES 方案第17h购电飙升？</li>
                </>
              ) : (
                <>
                  <li>• 如果光伏减少30%会怎样？</li>
                  <li>• 限制19-21时购电不超过3000kW</li>
                  <li>• 扫描光伏5000到30000的Pareto</li>
                  <li>• 切换到经济指标页面</li>
                </>
              )}
            </ul>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'assistant' && (
              <div className="shrink-0 w-6 h-6 rounded bg-[#00d4ff]/20 flex items-center justify-center">
                <Bot size={12} className="text-[#00d4ff]" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-[#172240] text-[#e8f4ff]'
                  : 'bg-[#111b2e] text-[#8ba9cc] border border-[#1e3256]'
              }`}
              style={{ fontFamily: "'Noto Sans SC', sans-serif" }}
            >
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[#1e3256] space-y-1">
                  {m.actions.map((a, i) => (
                    <div key={i} className="text-[10px] text-[#3d6080]">
                      {a.type}: {a.result}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {m.role === 'user' && (
              <div className="shrink-0 w-6 h-6 rounded bg-[#1e3256] flex items-center justify-center">
                <User size={12} className="text-[#8ba9cc]" />
              </div>
            )}
          </div>
        ))}
        {/* 工具链：直接显示在背景上，非气泡，类似 Cursor */}
        {isLoading && toolChain.length > 0 && (
          <div className="sticky bottom-0 left-0 right-0 pt-2">
            <div
              className="rounded border border-[#1e3256]/60 bg-[#0d1422]/95 backdrop-blur-sm"
              style={{ fontFamily: "'Noto Sans SC', sans-serif" }}
            >
              <div className="px-3 py-2 space-y-1.5">
                {toolChain.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-start gap-2 text-[11px] text-[#5a7a9a]"
                  >
                    <span
                      className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${
                        step.status === 'running'
                          ? 'bg-[#00d4ff] animate-pulse'
                          : 'bg-[#00d4ff]/60'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-[#8ba9cc]">{step.name}</span>
                      {step.status === 'done' && (
                        <span className="ml-1.5 text-[#3d6080]">✓</span>
                      )}
                      {thinkingExpanded && step.result && (
                        <p className="mt-0.5 text-[10px] text-[#3d6080] line-clamp-2">
                          {step.result}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setThinkingExpanded((v) => !v)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[#3d6080] hover:text-[#8ba9cc] border-t border-[#1e3256]/40 text-[10px] transition-colors"
              >
                {thinkingExpanded ? (
                  <>
                    <ChevronUp size={10} /> 收起
                  </>
                ) : (
                  <>
                    <ChevronDown size={10} /> 展开思考过程
                  </>
                )}
              </button>
            </div>
          </div>
        )}
        {isLoading && toolChain.length === 0 && (
          <div className="flex gap-2">
            <div className="shrink-0 w-6 h-6 rounded bg-[#00d4ff]/20 flex items-center justify-center">
              <Bot size={12} className="text-[#00d4ff]" />
            </div>
            <div className="bg-[#111b2e] border border-[#1e3256] rounded-lg px-3 py-2 text-[#3d6080] text-xs">
              <span className="animate-pulse">思考中...</span>
            </div>
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="shrink-0 px-3 py-1.5 bg-[#ff5252]/15 text-[#ff5252] text-xs border-t border-[#1e3256]">
          {error}
        </div>
      )}

      {/* 输入框 */}
      <div className="shrink-0 p-3 border-t border-[#1e3256]">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            placeholder={mode === 'ask' ? '输入问题...' : '输入指令...'}
            disabled={isLoading}
            onKeyDown={handleKeyDown}
            rows={2}
            className="flex-1 resize-none rounded border border-[#1e3256] bg-[#111b2e] px-3 py-2 text-sm text-[#e8f4ff] placeholder-[#3d6080] focus:outline-none focus:border-[#00d4ff]/50 disabled:opacity-50"
            style={{ fontFamily: "'Noto Sans SC', sans-serif" }}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading}
            className="shrink-0 p-2 rounded bg-[#00d4ff]/20 border border-[#00d4ff]/40 text-[#00d4ff] hover:bg-[#00d4ff]/30 disabled:opacity-50 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
