/**
 * 后端 API 客户端
 */

const API_BASE = '/api'

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
