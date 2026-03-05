/**
 * 后端 API 客户端
 */

const API_BASE = import.meta.env.VITE_API_BASE ? `${import.meta.env.VITE_API_BASE}/api` : '/api'

export async function fetchDefaultDataset() {
  const res = await fetch(`${API_BASE}/datasets/default`)
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return json.data as Record<string, unknown>
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
