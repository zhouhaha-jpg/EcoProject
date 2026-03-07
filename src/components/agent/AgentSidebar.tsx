/**
 * Agent 侧边栏容器：可折叠、可拖拽宽度、历史对话管理
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStrategy } from '@/context/StrategyContext'
import { registerAgentHandlers } from '@/lib/agentActions'
import { useAgentContext } from '@/hooks/useAgentContext'
import { useAgentChat } from '@/hooks/useAgentChat'
import AgentChat from './AgentChat'
import ConversationList from './ConversationList'
import ProactiveAlert from './ProactiveAlert'
import { MessageSquare, ChevronRight, History } from 'lucide-react'
import {
  fetchConversationsList,
  fetchConversation,
  deleteConversation,
} from '@/lib/api'
import type { ConversationItem } from '@/lib/api'
import type { ChatMessage } from '@/hooks/useAgentChat'
import type { RealtimeState, ShadowOptimization } from '@/hooks/useRealtimeData'

const MIN_WIDTH = 280
const MAX_WIDTH = 520
const DEFAULT_WIDTH = 380

interface AgentSidebarProps {
  realtimeData?: RealtimeState & {
    dismissAlert: (index: number) => void
    dismissShadowOpt: () => void
  }
}

export default function AgentSidebar({ realtimeData }: AgentSidebarProps) {
  const navigate = useNavigate()
  const { setActiveStrategy, loadScenarioDataset, loadParetoData } = useStrategy()
  const ctx = useAgentContext()

  const [conversationList, setConversationList] = useState<ConversationItem[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [listLoading, setListLoading] = useState(false)

  const refreshList = useCallback(async () => {
    setListLoading(true)
    try {
      const list = await fetchConversationsList()
      setConversationList(list)
    } catch (e) {
      console.warn('[conversations]', e)
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshList()
  }, [refreshList])

  const chat = useAgentChat(ctx, {
    conversationId: currentConversationId,
    onConversationCreated: (id) => setCurrentConversationId(id),
    onConversationListChange: refreshList,
  })

  const handleSelectConversation = useCallback(
    async (id: number) => {
      setCurrentConversationId(id)
      setShowHistory(false)
      try {
        const conv = await fetchConversation(id)
        const msgs: ChatMessage[] = conv.messages.map((m) => ({
          id: `msg-${m.id}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          actions: m.actions,
        }))
        chat.loadMessages(msgs)
        chat.setMode((conv.mode as 'ask' | 'agent') || 'agent')
      } catch (e) {
        console.warn('[load conversation]', e)
      }
    },
    [chat]
  )

  const handleNewConversation = useCallback(() => {
    setCurrentConversationId(null)
    chat.clearMessages()
    chat.setMode('agent')
    setShowHistory(false)
  }, [chat])

  const handleDeleteConversation = useCallback(
    async (id: number) => {
      try {
        await deleteConversation(id)
        if (currentConversationId === id) {
          setCurrentConversationId(null)
          chat.clearMessages()
        }
        refreshList()
      } catch (e) {
        console.warn('[delete conversation]', e)
      }
    },
    [currentConversationId, chat, refreshList]
  )

  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handlers_ref = useRef<{
    navigate: (path: string) => void
    loadScenarioDataset: (ds: Record<string, unknown>, label: string) => void
  } | null>(null)

  useEffect(() => {
    const h = {
      navigate: (path: string) => navigate(path),
      switchStrategy: setActiveStrategy,
      loadScenarioDataset,
      loadParetoData,
    }
    handlers_ref.current = h
    registerAgentHandlers(h)
  }, [navigate, setActiveStrategy, loadScenarioDataset, loadParetoData])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    startXRef.current = e.clientX
    startWidthRef.current = width
  }, [width])

  useEffect(() => {
    if (!isResizing) return
    const onMove = (e: MouseEvent) => {
      const delta = startXRef.current - e.clientX // 向左拖拽增加宽度
      let next = startWidthRef.current + delta
      next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next))
      setWidth(next)
    }
    const onUp = () => setIsResizing(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isResizing])

  return (
    <>
      {/* 拖拽条（仅在展开时显示） */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={handleResizeStart}
          className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#00d4ff]/30 transition-colors z-20 ${
            isResizing ? 'bg-[#00d4ff]/40' : 'bg-transparent'
          }`}
          title="拖拽调整宽度"
        />
      )}

      {/* 侧边栏主体 */}
      <div
        className="flex flex-col h-full border-l border-[#1e3256] bg-[#0d1422] relative"
        style={{
          width: collapsed ? 48 : width,
          minWidth: collapsed ? 48 : MIN_WIDTH,
          transition: isResizing ? 'none' : 'width 0.2s ease',
        }}
      >
        {collapsed ? (
          /* 折叠状态：仅图标条 */
          <div className="flex flex-col items-center py-4 gap-2">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="p-2 rounded text-[#8ba9cc] hover:text-[#00d4ff] hover:bg-[#00d4ff]/10 transition-colors"
              title="展开 Agent"
            >
              <MessageSquare size={20} />
            </button>
            <span
              className="text-[10px] text-[#3d6080]"
              style={{ fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}
            >
              AI
            </span>
          </div>
        ) : (
          /* 展开状态 */
          <>
            <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-[#1e3256]">
              <div
                className="flex items-center gap-2"
                style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 2, color: '#8ba9cc' }}
              >
                <MessageSquare size={14} className="text-[#00d4ff]" />
                AI Agent
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className={`p-1.5 rounded transition-colors ${showHistory ? 'text-[#00d4ff] bg-[#00d4ff]/10' : 'text-[#3d6080] hover:text-[#8ba9cc]'}`}
                  title="历史对话"
                >
                  <History size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  className="p-1.5 text-[#3d6080] hover:text-[#8ba9cc] rounded transition-colors"
                  title="折叠"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {/* 主动预警卡片 */}
              {realtimeData && (realtimeData.shadowOptimization || realtimeData.alerts.length > 0) && !showHistory && (
                <div className="shrink-0 px-3 pt-2">
                  <ProactiveAlert
                    shadowOptimization={realtimeData.shadowOptimization}
                    alerts={realtimeData.alerts}
                    onApplyOptimization={(opt: ShadowOptimization) => {
                      // 加载影子优化结果到方案对比页
                      if (handlers_ref.current) {
                        handlers_ref.current.loadScenarioDataset(
                          opt as unknown as Record<string, unknown>,
                          opt.datasetName
                        )
                        handlers_ref.current.navigate('/scenario')
                      }
                      realtimeData.dismissShadowOpt()
                    }}
                    onDismissOptimization={() => realtimeData.dismissShadowOpt()}
                    onDismissAlert={(i: number) => realtimeData.dismissAlert(i)}
                  />
                </div>
              )}
              {showHistory ? (
                <ConversationList
                  list={conversationList}
                  currentId={currentConversationId}
                  onSelect={handleSelectConversation}
                  onNew={handleNewConversation}
                  onDelete={handleDeleteConversation}
                  loading={listLoading}
                />
              ) : (
                <AgentChat
                  messages={chat.messages}
                  isLoading={chat.isLoading}
                  error={chat.error}
                  mode={chat.mode}
                  onModeChange={chat.setMode}
                  onSend={chat.sendMessage}
                  onClear={handleNewConversation}
                  toolChain={chat.toolChain}
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
