/**
 * 后端 API 客户端
 */

import type { AnomalyRun, DatasetMeta, EmergencyRun, InvestmentRun } from '@/types'

const API_BASE = import.meta.env.VITE_API_BASE ? `${import.meta.env.VITE_API_BASE}/api` : '/api'

export interface DisplayDatasetResponse {
  data: Record<string, unknown>
  meta: DatasetMeta
  id?: number
  name?: string
}

export interface EmergencyDispatchResponse {
  run: EmergencyRun
}

export async function fetchDefaultDataset() {
  const res = await fetch(`${API_BASE}/datasets/default`)
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.data as Record<string, unknown>
}

export async function fetchDisplayDataset(date?: string): Promise<DisplayDatasetResponse> {
  const suffix = date ? `?date=${encodeURIComponent(date)}` : ''
  const res = await fetch(`${API_BASE}/realtime/display${suffix}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchDatasetById(id: number) {
  const res = await fetch(`${API_BASE}/datasets/${id}`)
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.data as Record<string, unknown>
}

export async function fetchDatasetsList() {
  const res = await fetch(`${API_BASE}/datasets`)
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.data as Array<{ id: number; name: string; created_at: string }>
}

export async function runOptimizeAll(params?: Record<string, unknown>, extraConstraints?: unknown[]) {
  const res = await fetch(`${API_BASE}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      params: params ?? {},
      extra_constraints: extraConstraints ?? [],
      save: true,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export interface ConversationItem {
  id: number
  title: string
  mode: string
  created_at: string
  updated_at: string
  message_count: number
}

export interface ConversationMessage {
  id: number
  role: string
  content: string
  actions?: { type: string; params: Record<string, unknown>; result: string }[]
  created_at: string
}

export interface ConversationWorkspaceState {
  pageType: 'empty' | 'emergency' | 'scenario' | 'pareto' | 'investment' | 'anomaly'
  route: string
  emergencyRunId?: number | null
  emergencyApplied?: boolean
  investmentRunId?: number | null
  anomalyRunId?: number | null
  anomalyApplied?: boolean
  scenarioPayload?: {
    dataset: Record<string, unknown>
    label: string
  } | null
  paretoPayload?: {
    data: Record<string, unknown>
    label: string
  } | null
  investmentPayload?: {
    run: InvestmentRun
  } | null
  selectedPointIndex?: number | null
  savedAt: string
}

export async function fetchConversationsList(): Promise<ConversationItem[]> {
  const res = await fetch(`${API_BASE}/conversations`)
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.data
}

export async function fetchConversation(id: number): Promise<{
  id: number
  title: string
  mode: string
  workspaceState?: ConversationWorkspaceState | null
  created_at: string
  updated_at: string
  messages: ConversationMessage[]
}> {
  const res = await fetch(`${API_BASE}/conversations/${id}`)
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.data
}

export async function createConversation(mode: 'ask' | 'agent' = 'agent'): Promise<number> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.id
}

export async function updateConversationTitle(id: number, title: string): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function appendConversationMessage(
  id: number,
  msg: { role: string; content: string; actions?: { type: string; params: Record<string, unknown>; result: string }[] }
): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function deleteConversation(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}

export async function runOptimizeSingle(
  strategy: string,
  params?: Record<string, unknown>,
  extraConstraints?: unknown[]
) {
  const res = await fetch(`${API_BASE}/optimize/single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      strategy,
      params: params ?? {},
      extra_constraints: extraConstraints ?? [],
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateConversationWorkspace(id: number, workspaceState: ConversationWorkspaceState | null): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${id}/workspace`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceState }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function dispatchEmergencyPlan(payload: {
  prompt: string
  eventSpec?: Record<string, unknown>
  baselineDataset?: Record<string, unknown>
  baselineMeta?: DatasetMeta
  baselineDatasetId?: number | null
  activeStrategy?: string
  source?: string
}) {
  const res = await fetch(`${API_BASE}/emergency/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<EmergencyDispatchResponse>
}

export async function fetchEmergencyRuns(limit = 20): Promise<EmergencyRun[]> {
  const res = await fetch(`${API_BASE}/emergency/runs?limit=${limit}`)
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.data
}

export async function fetchEmergencyRun(id: number): Promise<EmergencyRun> {
  const res = await fetch(`${API_BASE}/emergency/runs/${id}`)
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.run
}

export async function applyEmergencyRunApi(id: number): Promise<{
  run: EmergencyRun
  dataset: DisplayDatasetResponse
}> {
  const res = await fetch(`${API_BASE}/emergency/runs/${id}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function restoreEmergencyStateApi(runId?: number | null): Promise<{
  run: EmergencyRun
  baselineDataset: DisplayDatasetResponse
}> {
  const res = await fetch(`${API_BASE}/emergency/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(runId != null ? { runId } : {}),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function dispatchInvestmentPlan(payload: {
  prompt: string
  assumptions?: Record<string, unknown>
  baselineDataset?: Record<string, unknown>
  baselineMeta?: DatasetMeta
  baselineDatasetId?: number | null
  activeStrategy?: string
  source?: string
}) {
  const res = await fetch(`${API_BASE}/investment/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<{ run: InvestmentRun }>
}

export async function fetchInvestmentRuns(limit = 20): Promise<InvestmentRun[]> {
  const res = await fetch(`${API_BASE}/investment/runs?limit=${limit}`)
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.data
}

export async function fetchInvestmentRun(id: number): Promise<InvestmentRun> {
  const res = await fetch(`${API_BASE}/investment/runs/${id}`)
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.run
}

export async function dispatchAnomalyPlan(payload: {
  prompt: string
  eventSpec?: Record<string, unknown>
  baselineDataset?: Record<string, unknown>
  baselineMeta?: DatasetMeta
  baselineDatasetId?: number | null
  activeStrategy?: string
  source?: string
}) {
  const res = await fetch(`${API_BASE}/anomaly/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<{ run: AnomalyRun }>
}

export async function fetchAnomalyRuns(limit = 20): Promise<AnomalyRun[]> {
  const res = await fetch(`${API_BASE}/anomaly/runs?limit=${limit}`)
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.data
}

export async function fetchAnomalyRun(id: number): Promise<AnomalyRun> {
  const res = await fetch(`${API_BASE}/anomaly/runs/${id}`)
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.run
}

export async function applyAnomalyRunApi(id: number): Promise<{
  run: AnomalyRun
  dataset: DisplayDatasetResponse
}> {
  const res = await fetch(`${API_BASE}/anomaly/runs/${id}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function restoreAnomalyStateApi(runId?: number | null): Promise<{
  run: AnomalyRun
  baselineDataset: DisplayDatasetResponse
}> {
  const res = await fetch(`${API_BASE}/anomaly/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(runId != null ? { runId } : {}),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
