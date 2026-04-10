/**
 * LLM 供应商配置 API
 * GET    /api/llm/providers            - 供应商列表（api_key 脱敏）
 * GET    /api/llm/providers/active      - 当前激活的供应商
 * POST   /api/llm/providers            - 新增供应商
 * PUT    /api/llm/providers/:id        - 更新供应商
 * DELETE /api/llm/providers/:id        - 删除供应商
 * POST   /api/llm/providers/:id/activate - 激活供应商
 */
import { Router } from 'express'
import {
  listLLMProviders,
  getLLMProvider,
  getActiveLLMProvider,
  createLLMProvider,
  updateLLMProvider,
  deleteLLMProvider,
  activateLLMProvider,
} from '../db/index.js'

const router = Router()

function maskApiKey(key) {
  if (!key || key.length <= 8) return '****'
  return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4)
}

function sanitizeProvider(row) {
  if (!row) return null
  return {
    ...row,
    api_key_masked: maskApiKey(row.api_key),
    api_key: undefined,
    model_mapping: row.model_mapping ? JSON.parse(row.model_mapping) : null,
  }
}

router.get('/active', (_req, res) => {
  try {
    const row = getActiveLLMProvider()
    res.json({ data: row ? sanitizeProvider(row) : null })
  } catch (err) {
    console.error('[llm/providers active]', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/', (_req, res) => {
  try {
    const rows = listLLMProviders()
    res.json({ data: rows.map(sanitizeProvider) })
  } catch (err) {
    console.error('[llm/providers list]', err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/', (req, res) => {
  try {
    const { name, base_url, api_key, model, api_format, auth_header, model_mapping, notes } = req.body
    if (!name || !base_url || !api_key) {
      return res.status(400).json({ error: '需提供 name、base_url 和 api_key' })
    }
    const id = createLLMProvider({ name, base_url, api_key, model, api_format, auth_header, model_mapping, notes })
    res.status(201).json({ id })
  } catch (err) {
    console.error('[llm/providers create]', err)
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: '无效 ID' })
    const existing = getLLMProvider(id)
    if (!existing) return res.status(404).json({ error: '供应商不存在' })
    updateLLMProvider(id, req.body)
    if (existing.is_active === 1 && typeof globalThis.__reloadLLMClient === 'function') {
      globalThis.__reloadLLMClient()
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[llm/providers update]', err)
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: '无效 ID' })
    const existing = getLLMProvider(id)
    deleteLLMProvider(id)
    if (existing?.is_active === 1 && typeof globalThis.__reloadLLMClient === 'function') {
      globalThis.__reloadLLMClient()
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[llm/providers delete]', err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/activate', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: '无效 ID' })
    const existing = getLLMProvider(id)
    if (!existing) return res.status(404).json({ error: '供应商不存在' })
    activateLLMProvider(id)

    if (typeof globalThis.__reloadLLMClient === 'function') {
      globalThis.__reloadLLMClient()
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('[llm/providers activate]', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
