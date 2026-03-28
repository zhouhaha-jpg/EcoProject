/**
 * Agent 侧边栏容器：可折叠、可拖拽宽度、历史对话管理
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStrategy } from '@/context/StrategyContext'
import type { ParetoData } from '@/context/StrategyContext'
import { registerAgentHandlers } from '@/lib/agentActions'
import { useAgentContext } from '@/hooks/useAgentContext'
import { useAgentChat } from '@/hooks/useAgentChat'
import AgentChat from './AgentChat'
import ConversationList from './ConversationList'
import ProactiveAlert from './ProactiveAlert'
import { MessageSquare, ChevronRight, History, Settings } from 'lucide-react'
import LLMProviderSettings from './LLMProviderSettings'
import {
  fetchConversationsList,
  fetchConversation,
  deleteConversation,
  updateConversationWorkspace,
  fetchEmergencyRun,
  fetchInvestmentRun,
  fetchAnomalyRun,
} from '@/lib/api'
import { applyEmergencyRunApi } from '@/lib/api'
import type { ConversationItem, ConversationWorkspaceState } from '@/lib/api'
import type { ChatMessage } from '@/hooks/useAgentChat'
import type { RealtimeState, ShadowOptimization } from '@/hooks/useRealtimeData'
import type { AnomalyRun, EmergencyRun, ExecutionTraceStep, InvestmentRun, ScenarioInsight } from '@/types'

const CONVERSATION_STORAGE_KEY = 'eco-agent-current-conversation-id'

const MIN_WIDTH = 280
const MAX_WIDTH = 520
const DEFAULT_WIDTH = 380

interface AgentSidebarProps {
  realtimeData?: RealtimeState & {
    dismissAlert: (index: number) => void
    dismissShadowOpt: () => void
    dismissEmergencyPlan: () => void
  }
}

function buildWorkspaceState(args: {
  scenarioDataset: Record<string, unknown> | null
  scenarioLabel: string | null
  scenarioInsight: ScenarioInsight | null
  scenarioTrace: ExecutionTraceStep[]
  paretoData: Record<string, unknown> | null
  paretoLabel: string | null
  emergencyPreviewRun: EmergencyRun | null
  emergencyActiveRun: EmergencyRun | null
  investmentPlan: InvestmentRun | null
  anomalyPreviewRun: AnomalyRun | null
  anomalyActiveRun: AnomalyRun | null
  datasetMetaEmergency: boolean | undefined
  datasetMetaAnomaly: boolean | undefined
}): ConversationWorkspaceState {
  const currentEmergency = args.emergencyPreviewRun ?? args.emergencyActiveRun
  if (currentEmergency) {
    return {
      pageType: 'emergency',
      route: '/scenario',
      emergencyRunId: currentEmergency.id,
      emergencyApplied: Boolean(args.datasetMetaEmergency && args.emergencyActiveRun && args.emergencyActiveRun.id === currentEmergency.id),
      selectedPointIndex: null,
      savedAt: new Date().toISOString(),
    }
  }

  const currentAnomaly = args.anomalyPreviewRun ?? args.anomalyActiveRun
  if (currentAnomaly) {
    return {
      pageType: 'anomaly',
      route: '/scenario',
      anomalyRunId: currentAnomaly.id,
      anomalyApplied: Boolean(args.datasetMetaAnomaly && args.anomalyActiveRun && args.anomalyActiveRun.id === currentAnomaly.id),
      savedAt: new Date().toISOString(),
    }
  }

  if (args.investmentPlan) {
    return {
      pageType: 'investment',
      route: '/scenario',
      investmentRunId: args.investmentPlan.id,
      investmentPayload: { run: args.investmentPlan },
      savedAt: new Date().toISOString(),
    }
  }

  if (args.scenarioDataset && args.scenarioLabel) {
    return {
      pageType: 'scenario',
      route: '/scenario',
      scenarioPayload: {
        dataset: args.scenarioDataset,
        label: args.scenarioLabel,
        insight: args.scenarioInsight,
        trace: args.scenarioTrace,
      },
      savedAt: new Date().toISOString(),
    }
  }

  if (args.paretoData && args.paretoLabel) {
    return {
      pageType: 'pareto',
      route: '/scenario',
      paretoPayload: {
        data: args.paretoData,
        label: args.paretoLabel,
      },
      savedAt: new Date().toISOString(),
    }
  }

  return {
    pageType: 'empty',
    route: '/scenario',
    savedAt: new Date().toISOString(),
  }
}

export default function AgentSidebar({ realtimeData }: AgentSidebarProps) {
  const navigate = useNavigate()
  const {
    setActiveStrategy,
    loadScenarioDataset,
    loadParetoData,
    scenarioDataset,
    scenarioLabel,
    scenarioInsight,
    scenarioTrace,
    paretoData,
    paretoLabel,
    emergencyPreviewRun,
    emergencyActiveRun,
    investmentPlan,
    setInvestmentPlan,
    anomalyPreviewRun,
    anomalyActiveRun,
    datasetMeta,
    setEmergencyPreviewRun,
    applyEmergencyRunState,
    setAnomalyPreviewRun,
    applyAnomalyRunState,
    restoreNormalDatasetState,
    resetWorkspaceState,
  } = useStrategy()
  const ctx = useAgentContext()

  const [conversationList, setConversationList] = useState<ConversationItem[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = window.localStorage.getItem(CONVERSATION_STORAGE_KEY)
    const parsed = stored ? Number(stored) : Number.NaN
    return Number.isFinite(parsed) ? parsed : null
  })
  const [showHistory, setShowHistory] = useState(false)
  const [showLLMSettings, setShowLLMSettings] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const hasBootstrappedRef = useRef(false)
  const restoringWorkspaceRef = useRef(false)

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

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (currentConversationId == null) {
      window.localStorage.removeItem(CONVERSATION_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(CONVERSATION_STORAGE_KEY, String(currentConversationId))
  }, [currentConversationId])

  const chat = useAgentChat(ctx, {
    conversationId: currentConversationId,
    onConversationCreated: (id) => setCurrentConversationId(id),
    onConversationListChange: refreshList,
  })

  const restoreWorkspaceFromState = useCallback(async (workspaceState?: ConversationWorkspaceState | null) => {
    resetWorkspaceState({ restoreDisplay: true })
    if (!workspaceState || workspaceState.pageType === 'empty') return

    if (workspaceState.pageType === 'emergency' && workspaceState.emergencyRunId) {
      try {
        const run = await fetchEmergencyRun(workspaceState.emergencyRunId)
        if (workspaceState.emergencyApplied) {
          applyEmergencyRunState(run, run.emergencyDataset?.data as unknown as Record<string, unknown> | undefined, run.emergencyDataset?.meta)
        } else {
          setEmergencyPreviewRun(run)
        }
        navigate(workspaceState.route || '/scenario')
      } catch (error) {
        console.warn('[restore emergency workspace]', error)
      }
      return
    }

    if (workspaceState.pageType === 'anomaly' && workspaceState.anomalyRunId) {
      try {
        const run = await fetchAnomalyRun(workspaceState.anomalyRunId)
        if (workspaceState.anomalyApplied) {
          applyAnomalyRunState(run, run.anomalyDataset?.data as unknown as Record<string, unknown> | undefined, run.anomalyDataset?.meta)
        } else {
          setAnomalyPreviewRun(run)
        }
        navigate(workspaceState.route || '/scenario')
      } catch (error) {
        console.warn('[restore anomaly workspace]', error)
      }
      return
    }

    if (workspaceState.pageType === 'investment') {
      try {
        const run = workspaceState.investmentRunId
          ? await fetchInvestmentRun(workspaceState.investmentRunId)
          : workspaceState.investmentPayload?.run ?? null
        if (run) {
          setInvestmentPlan(run)
          navigate(workspaceState.route || '/scenario')
        }
      } catch (error) {
        console.warn('[restore investment workspace]', error)
      }
      return
    }

    if (workspaceState.pageType === 'scenario' && workspaceState.scenarioPayload) {
      loadScenarioDataset(workspaceState.scenarioPayload.dataset, workspaceState.scenarioPayload.label, {
        insight: workspaceState.scenarioPayload.insight ?? null,
        trace: workspaceState.scenarioPayload.trace ?? [],
      })
      navigate(workspaceState.route || '/scenario')
      return
    }

    if (workspaceState.pageType === 'pareto' && workspaceState.paretoPayload) {
      loadParetoData(workspaceState.paretoPayload.data as unknown as ParetoData, workspaceState.paretoPayload.label)
      navigate(workspaceState.route || '/scenario')
    }
  }, [applyAnomalyRunState, applyEmergencyRunState, loadParetoData, loadScenarioDataset, navigate, resetWorkspaceState, setAnomalyPreviewRun, setEmergencyPreviewRun, setInvestmentPlan])

  const handleSelectConversation = useCallback(
    async (id: number) => {
      setCurrentConversationId(id)
      setShowHistory(false)
      restoringWorkspaceRef.current = true
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
        await restoreWorkspaceFromState(conv.workspaceState)
      } catch (e) {
        console.warn('[load conversation]', e)
      } finally {
        restoringWorkspaceRef.current = false
      }
    },
    [chat, restoreWorkspaceFromState]
  )

  const handleNewConversation = useCallback(() => {
    setCurrentConversationId(null)
    chat.clearMessages()
    chat.setMode('agent')
    setShowHistory(false)
    resetWorkspaceState({ restoreDisplay: true })
  }, [chat, resetWorkspaceState])

  const handleDeleteConversation = useCallback(
    async (id: number) => {
      try {
        await deleteConversation(id)
        if (currentConversationId === id) {
          setCurrentConversationId(null)
          chat.clearMessages()
          resetWorkspaceState({ restoreDisplay: true })
        }
        refreshList()
      } catch (e) {
        console.warn('[delete conversation]', e)
      }
    },
    [currentConversationId, chat, refreshList, resetWorkspaceState]
  )

  useEffect(() => {
    if (hasBootstrappedRef.current) return
    if (currentConversationId == null) {
      hasBootstrappedRef.current = true
      return
    }
    hasBootstrappedRef.current = true
    void handleSelectConversation(currentConversationId)
  }, [currentConversationId, handleSelectConversation])

  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handlers_ref = useRef<{
    navigate: (path: string) => void
    loadScenarioDataset: (
      ds: Record<string, unknown>,
      label: string,
      options?: { insight?: ScenarioInsight | null; trace?: ExecutionTraceStep[] | null },
    ) => void
    setEmergencyPreviewRun?: (run: EmergencyRun | null) => void
  } | null>(null)

  useEffect(() => {
    const h = {
      navigate: (path: string) => navigate(path),
      switchStrategy: setActiveStrategy,
      loadScenarioDataset,
      loadParetoData,
      setEmergencyPreviewRun,
      applyEmergencyRunState,
      setInvestmentPlan,
      setAnomalyPreviewRun,
      applyAnomalyRunState,
      restoreNormalDatasetState,
    }
    handlers_ref.current = h
    registerAgentHandlers(h)
  }, [navigate, setActiveStrategy, loadScenarioDataset, loadParetoData, setEmergencyPreviewRun, applyEmergencyRunState, setInvestmentPlan, setAnomalyPreviewRun, applyAnomalyRunState, restoreNormalDatasetState])

  useEffect(() => {
    if (currentConversationId == null) return
    if (restoringWorkspaceRef.current) return
    const timer = window.setTimeout(() => {
      const workspaceState = buildWorkspaceState({
        scenarioDataset: scenarioDataset as unknown as Record<string, unknown> | null,
        scenarioLabel,
        scenarioInsight,
        scenarioTrace,
        paretoData: paretoData as unknown as Record<string, unknown> | null,
        paretoLabel,
        emergencyPreviewRun,
        emergencyActiveRun,
        investmentPlan,
        anomalyPreviewRun,
        anomalyActiveRun,
        datasetMetaEmergency: datasetMeta.emergencyActive,
        datasetMetaAnomaly: datasetMeta.anomalyActive,
      })
      updateConversationWorkspace(currentConversationId, workspaceState).catch((error) => {
        console.warn('[save workspace]', error)
      })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [
    currentConversationId,
    datasetMeta.emergencyActive,
    emergencyActiveRun,
    emergencyPreviewRun,
    investmentPlan,
    anomalyActiveRun,
    anomalyPreviewRun,
    paretoData,
    paretoLabel,
    scenarioDataset,
    scenarioLabel,
    scenarioInsight,
    scenarioTrace,
    datasetMeta.anomalyActive,
  ])

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
              ECO
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
                EcoClaw
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowLLMSettings(true)}
                  className="p-1.5 rounded transition-colors text-[#3d6080] hover:text-[#8ba9cc]"
                  title="LLM 供应商设置"
                >
                  <Settings size={14} />
                </button>
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
              {realtimeData && (realtimeData.emergencyPlan || realtimeData.shadowOptimization || realtimeData.alerts.length > 0) && !showHistory && (
                <div className="shrink-0 px-3 pt-2">
                  <ProactiveAlert
                    emergencyPlan={realtimeData.emergencyPlan}
                    shadowOptimization={realtimeData.shadowOptimization}
                    alerts={realtimeData.alerts}
                    onApplyEmergency={async (run: EmergencyRun) => {
                      const applied = await applyEmergencyRunApi(run.id)
                      applyEmergencyRunState(applied.run, applied.dataset.data, applied.dataset.meta)
                      setEmergencyPreviewRun(applied.run)
                      navigate('/scenario')
                      realtimeData.dismissEmergencyPlan()
                    }}
                    onDismissEmergency={() => realtimeData.dismissEmergencyPlan()}
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
                  serverLogs={realtimeData?.serverLogs ?? []}
                  onRestoreWorkspace={restoreWorkspaceFromState}
                />
              )}
            </div>
          </>
        )}
      </div>
      <LLMProviderSettings open={showLLMSettings} onClose={() => setShowLLMSettings(false)} />
    </>
  )
}
