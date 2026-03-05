/**
 * 对话历史 API
 * GET  /api/conversations      - 列表
 * POST /api/conversations      - 创建
 * GET  /api/conversations/:id  - 获取（含消息）
 * PUT  /api/conversations/:id  - 更新标题/模式
 * POST /api/conversations/:id/messages - 追加消息
 * DELETE /api/conversations/:id - 删除
 */
import { Router } from 'express'
import {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  appendMessage,
  deleteConversation,
} from '../db/index.js'

const router = Router()

router.get('/', (req, res) => {
  try {
    const rows = listConversations()
    res.json({ data: rows })
  } catch (err) {
    console.error('[conversations list]', err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/', (req, res) => {
  try {
    const { mode = 'agent' } = req.body
    const id = createConversation(mode)
    res.status(201).json({ id })
  } catch (err) {
    console.error('[conversations create]', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: '无效 ID' })
    const row = getConversation(id)
    if (!row) return res.status(404).json({ error: '对话不存在' })
    res.json({ data: row })
  } catch (err) {
    console.error('[conversations get]', err)
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: '无效 ID' })
    const { title, mode } = req.body
    if (!title && !mode) return res.status(400).json({ error: '需提供 title 或 mode' })
    const exists = getConversation(id)
    if (!exists) return res.status(404).json({ error: '对话不存在' })
    updateConversation(id, { title, mode })
    res.json({ ok: true })
  } catch (err) {
    console.error('[conversations update]', err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/messages', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: '无效 ID' })
    const { role, content, actions } = req.body
    if (!role || content === undefined) return res.status(400).json({ error: '需提供 role 和 content' })
    const exists = getConversation(id)
    if (!exists) return res.status(404).json({ error: '对话不存在' })
    appendMessage(id, { role, content: String(content), actions })
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('[conversations append]', err)
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: '无效 ID' })
    deleteConversation(id)
    res.json({ ok: true })
  } catch (err) {
    console.error('[conversations delete]', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
