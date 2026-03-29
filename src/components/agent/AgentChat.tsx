/**
 * Agent 聊天：消息列表 + 思考过程面板 + 工具链展示 + 输入框
 */

import { useRef, useEffect, useState } from 'react'
import type { ChatMessage, ToolChainStep } from '@/hooks/useAgentChat'
import type { ConversationWorkspaceState } from '@/lib/api'
import AgentModeSwitch from './AgentModeSwitch'
import { Send, Trash2, User, Bot, ChevronDown, ChevronUp, History, Brain } from 'lucide-react'

interface AgentChatProps {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  mode: 'ask' | 'agent'
  onModeChange: (mode: 'ask' | 'agent') => void
  onSend: (content: string) => void
  onClear: () => void
  toolChain?: ToolChainStep[]
  thinkingText?: string
  thinkingDuration?: number
  onRestoreWorkspace?: (workspaceState: ConversationWorkspaceState) => void
}

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '执行中',
  done: '完成',
  error: '失败',
}

// ── Markdown 渲染 ─────────────────────────────────────────────

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${part}-${index}`} className="font-semibold text-[#e8f4ff]">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={`${part}-${index}`}
          className="rounded bg-[#0a1420] px-1.5 py-0.5 text-[#00d4ff]"
          style={{ fontFamily: "'Share Tech Mono', monospace" }}
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={`${part}-${index}`} className="text-[#cfe6ff]">{part.slice(1, -1)}</em>
    }
    return <span key={`${part}-${index}`}>{part}</span>
  })
}

function splitMarkdownTableRow(line: string) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function isMarkdownTableSeparator(line: string) {
  const cells = splitMarkdownTableRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function renderMarkdownTable(lines: string[], key: string) {
  if (lines.length < 2 || !isMarkdownTableSeparator(lines[1])) {
    return (
      <pre
        key={key}
        className="overflow-x-auto rounded border border-[#1e3256] bg-[#0a1420] px-3 py-2 text-[11px] text-[#8ba9cc]"
        style={{ fontFamily: "'Share Tech Mono', monospace", whiteSpace: 'pre-wrap' }}
      >
        {lines.join('\n')}
      </pre>
    )
  }

  const header = splitMarkdownTableRow(lines[0])
  const rows = lines.slice(2).map(splitMarkdownTableRow).filter((row) => row.length > 0)

  return (
    <div key={key} className="overflow-x-auto rounded border border-[#1e3256] bg-[#0a1420]">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#1e3256] bg-[#101a2c]">
            {header.map((cell, index) => (
              <th key={`th-${index}`} className="px-3 py-2 text-left font-semibold text-[#e8f4ff]" style={{ whiteSpace: 'nowrap' }}>
                {renderInlineMarkdown(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`tr-${rowIndex}`} className={rowIndex < rows.length - 1 ? 'border-b border-[#13213b]' : ''}>
              {header.map((_, cellIndex) => (
                <td key={`td-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top text-[#8ba9cc]" style={{ lineHeight: 1.7 }}>
                  {renderInlineMarkdown(row[cellIndex] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderMarkdownContent(content: string) {
  const elements: JSX.Element[] = []
  const bulletBuffer: string[] = []
  const orderedBuffer: string[] = []
  const tableBuffer: string[] = []

  const flushBullets = () => {
    if (!bulletBuffer.length) return
    elements.push(
      <ul key={`ul-${elements.length}`} className="space-y-1 pl-4 text-[#8ba9cc]" style={{ listStyleType: 'disc' }}>
        {bulletBuffer.map((item, index) => <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>)}
      </ul>,
    )
    bulletBuffer.length = 0
  }

  const flushOrdered = () => {
    if (!orderedBuffer.length) return
    elements.push(
      <ol key={`ol-${elements.length}`} className="space-y-1 pl-4 text-[#8ba9cc]" style={{ listStyleType: 'decimal' }}>
        {orderedBuffer.map((item, index) => <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>)}
      </ol>,
    )
    orderedBuffer.length = 0
  }

  const flushTables = () => {
    if (!tableBuffer.length) return
    elements.push(renderMarkdownTable([...tableBuffer], `table-${elements.length}`))
    tableBuffer.length = 0
  }

  const flushAll = () => { flushBullets(); flushOrdered(); flushTables() }

  content.split('\n').forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) { flushAll(); return }

    if (/^\|.*\|$/.test(trimmed)) { flushBullets(); flushOrdered(); tableBuffer.push(trimmed); return }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/)
    if (headingMatch) {
      flushAll()
      const level = headingMatch[1].length
      const fontSize = level === 1 ? 18 : level === 2 ? 16 : level === 3 ? 14 : 13
      elements.push(
        <div key={`h-${index}`} style={{ color: '#e8f4ff', fontWeight: 700, fontSize, marginTop: 4 }}>
          {renderInlineMarkdown(headingMatch[2])}
        </div>,
      )
      return
    }

    if (/^[-*]\s+/.test(trimmed)) { flushOrdered(); flushTables(); bulletBuffer.push(trimmed.replace(/^[-*]\s+/, '')); return }
    if (/^\d+\.\s+/.test(trimmed)) { flushBullets(); flushTables(); orderedBuffer.push(trimmed.replace(/^\d+\.\s+/, '')); return }

    flushAll()
    elements.push(
      <p key={`p-${index}`} className="text-[#8ba9cc]" style={{ lineHeight: 1.8 }}>
        {renderInlineMarkdown(trimmed)}
      </p>,
    )
  })

  flushAll()
  return <div className="space-y-2">{elements}</div>
}

// ── 思考过程面板 ──────────────────────────────────────────────

function ThinkingPanel({ text, duration, isStreaming }: { text: string; duration: number; isStreaming: boolean }) {
  const [expanded, setExpanded] = useState(isStreaming)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (expanded && panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight
    }
  }, [text, expanded])

  const durationStr = duration > 0 ? `${duration.toFixed(1)}秒` : ''

  return (
    <div className="rounded border border-[#1e3256]/60 bg-[#0d1422] mb-2" style={{ fontFamily: "'Noto Sans SC', sans-serif" }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-[#5a7a9a] hover:text-[#8ba9cc] transition-colors"
      >
        <Brain size={12} className={isStreaming ? 'text-[#00d4ff] animate-pulse' : 'text-[#00d4ff]/60'} />
        <span className="font-medium">
          {isStreaming ? '思考中...' : '思考过程'}
        </span>
        {durationStr && <span className="text-[10px] text-[#3d6080]">{durationStr}</span>}
        <span className="ml-auto">
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </span>
      </button>
      {expanded && (
        <div
          ref={panelRef}
          className="px-3 pb-2.5 max-h-[200px] overflow-y-auto"
        >
          <div
            className="text-[11px] text-[#4a6a8a] leading-relaxed whitespace-pre-wrap break-words"
            style={{ fontFamily: "'Noto Sans SC', sans-serif" }}
          >
            {text}
            {isStreaming && <span className="inline-block w-1 h-3 bg-[#00d4ff]/60 animate-pulse ml-0.5 align-text-bottom" />}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 工具调用链面板 (Cursor 风格) ──────────────────────────────

function ToolChainPanel({ steps }: { steps: ToolChainStep[] }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="rounded border border-[#1e3256]/60 bg-[#0d1422]/95 backdrop-blur-sm mb-2" style={{ fontFamily: "'Noto Sans SC', sans-serif" }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-[#5a7a9a] hover:text-[#8ba9cc] transition-colors"
      >
        <span className="font-medium text-[#8ba9cc]">工具调用</span>
        <span className="text-[10px] text-[#3d6080]">{steps.length} 步</span>
        <span className="ml-auto">
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {steps.map((step) => (
            <div key={step.id} className="flex items-start gap-2 py-1 text-[11px]">
              <span
                className={`shrink-0 mt-[5px] w-1.5 h-1.5 rounded-full ${
                  step.status === 'running'
                    ? 'bg-[#00d4ff] animate-pulse'
                    : step.status === 'error'
                      ? 'bg-[#ff7043]'
                      : step.status === 'done'
                        ? 'bg-[#69f0ae]'
                        : 'bg-[#3d6080]'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#8ba9cc]">{step.title}</span>
                  <span className={`text-[10px] shrink-0 ${
                    step.status === 'running' ? 'text-[#00d4ff]'
                      : step.status === 'error' ? 'text-[#ff7043]'
                        : step.status === 'done' ? 'text-[#69f0ae]'
                          : 'text-[#3d6080]'
                  }`}>
                    {STATUS_LABEL[step.status] || step.status}
                  </span>
                </div>
                {step.detail && (
                  <p className="mt-0.5 text-[10px] text-[#4a6a8a] truncate">{step.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────

export default function AgentChat({
  messages,
  isLoading,
  error,
  mode,
  onModeChange,
  onSend,
  onClear,
  toolChain = [],
  thinkingText = '',
  thinkingDuration = 0,
  onRestoreWorkspace,
}: AgentChatProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinkingText, toolChain])

  useEffect(() => {
    const handlePrefill = (event: Event) => {
      const customEvent = event as CustomEvent<{ prompt?: string }>
      if (!inputRef.current || !customEvent.detail?.prompt) return
      inputRef.current.value = customEvent.detail.prompt
      inputRef.current.focus()
    }
    window.addEventListener('agent:prefill', handlePrefill as EventListener)
    return () => window.removeEventListener('agent:prefill', handlePrefill as EventListener)
  }, [])

  useEffect(() => {
    const handleAsk = (event: Event) => {
      const customEvent = event as CustomEvent<{ prompt?: string }>
      const prompt = customEvent.detail?.prompt?.trim()
      if (!prompt || isLoading) return
      onSend(prompt)
      if (inputRef.current) inputRef.current.value = ''
    }
    window.addEventListener('agent:ask', handleAsk as EventListener)
    return () => window.removeEventListener('agent:ask', handleAsk as EventListener)
  }, [isLoading, onSend])

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

  const showThinkingPanel = isLoading && thinkingText.length > 0
  const showToolChain = isLoading && toolChain.length > 0
  const showTypingIndicator = isLoading && !showThinkingPanel && !showToolChain
    && !messages.some((m) => m.role === 'assistant' && m.content.length > 0 && m.id === messages[messages.length - 1]?.id)

  return (
    <div className="flex flex-col h-full">
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

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0 relative"
      >
        {messages.length === 0 && (
          <div className="text-center py-8 text-[#3d6080] text-xs">
            <p className="mb-2">
              {mode === 'ask' ? '基于当前数据提问，例如：' : '直接下达指令，例如：'}
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
                  <li>• 台风来了，电网故障，生成应急预案</li>
                  <li>• 切换到经济指标页面</li>
                </>
              )}
            </ul>
          </div>
        )}

        {messages.map((m, idx) => {
          const isStreamingMsg = isLoading && m.role === 'assistant' && idx === messages.length - 1

          if (isStreamingMsg) {
            return (
              <div key={m.id}>
                {/* Bot 图标 */}
                <div className="flex gap-2 justify-start">
                  <div className="shrink-0 w-6 h-6 rounded bg-[#00d4ff]/20 flex items-center justify-center">
                    <Bot size={12} className="text-[#00d4ff]" />
                  </div>
                </div>

                {/* 思考面板 → 工具链 → 内容气泡：从上到下依次出现 */}
                {showThinkingPanel && (
                  <div className="mt-2 ml-8">
                    <ThinkingPanel text={thinkingText} duration={thinkingDuration} isStreaming />
                  </div>
                )}
                {showToolChain && (
                  <div className="mt-2 ml-8">
                    <ToolChainPanel steps={toolChain} />
                  </div>
                )}
                {m.content && (
                  <div className="mt-2 flex gap-2 justify-start">
                    <div className="shrink-0 w-6 h-6" />
                    <div
                      className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-[#111b2e] text-[#8ba9cc] border border-[#1e3256]"
                      style={{ fontFamily: "'Noto Sans SC', sans-serif" }}
                    >
                      <div className="break-words">{renderMarkdownContent(m.content)}</div>
                    </div>
                  </div>
                )}
              </div>
            )
          }

          return (
            <div key={m.id}>
              <div className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                  {m.role === 'assistant'
                    ? <div className="break-words">{renderMarkdownContent(m.content)}</div>
                    : <div className="whitespace-pre-wrap break-words">{m.content}</div>}
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#1e3256] space-y-2">
                      {m.actions.map((a, i) => (
                        <div key={i} className="rounded border border-[#1e3256] bg-[#0d1422] px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] uppercase tracking-[0.12em] text-[#00d4ff]">{a.type}</span>
                            <div className="flex items-center gap-2">
                              {a.workspaceState && onRestoreWorkspace ? (
                                <button
                                  type="button"
                                  onClick={() => onRestoreWorkspace(a.workspaceState!)}
                                  className="inline-flex items-center gap-1 rounded border border-[#1e3256] bg-[#111b2e] px-2 py-1 text-[10px] text-[#8ba9cc] transition-colors hover:border-[#00d4ff]/50 hover:text-[#e8f4ff]"
                                  title="恢复这一轮分析对应的工作区"
                                >
                                  <History size={10} />
                                  恢复该轮工作区
                                </button>
                              ) : null}
                              <span className="text-[10px] text-[#3d6080]">{a.result}</span>
                            </div>
                          </div>
                          {a.trace && a.trace.length > 0 ? (
                            <div className="mt-2 space-y-1.5">
                              {a.trace.map((step) => (
                                <div key={step.id} className="rounded border border-[#1e3256]/60 bg-[#111b2e]/70 px-2 py-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-[#8ba9cc]">{step.title}</span>
                                    <span className="text-[10px] text-[#3d6080]">{step.status}</span>
                                  </div>
                                  {step.detail ? <div className="mt-1 text-[10px] text-[#5a7a9a]">{step.detail}</div> : null}
                                  {step.outcome ? <div className="mt-1 text-[10px] text-[#69f0ae]">{step.outcome}</div> : null}
                                </div>
                              ))}
                            </div>
                          ) : a.detail ? (
                            <div className="mt-1.5 whitespace-pre-wrap text-[10px] text-[#5a7a9a]">{a.detail}</div>
                          ) : null}
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

              {/* 完成后的思考过程（气泡下方） */}
              {m.role === 'assistant' && m.thinking && (
                <div className="mt-1 ml-8">
                  <ThinkingPanel text={m.thinking} duration={0} isStreaming={false} />
                </div>
              )}
            </div>
          )
        })}

        {/* 简单打字指示器 */}
        {showTypingIndicator && (
          <div className="flex gap-2">
            <div className="shrink-0 w-6 h-6 rounded bg-[#00d4ff]/20 flex items-center justify-center">
              <Bot size={12} className="text-[#00d4ff]" />
            </div>
            <div className="bg-[#111b2e] border border-[#1e3256] rounded-lg px-3 py-2 text-[#5a7a9a] text-xs flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-[#00d4ff] animate-pulse" />
              <span className="w-1 h-1 rounded-full bg-[#00d4ff] animate-pulse" style={{ animationDelay: '0.2s' }} />
              <span className="w-1 h-1 rounded-full bg-[#00d4ff] animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="shrink-0 px-3 py-1.5 bg-[#ff5252]/15 text-[#ff5252] text-xs border-t border-[#1e3256]">
          {error}
        </div>
      )}

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
