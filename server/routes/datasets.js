/**
 * 数据集 API
 * GET /api/datasets - 列表
 * GET /api/datasets/:id - 详情（含完整 data）
 * GET /api/datasets/default - 默认数据集
 */
import { Router } from 'express'
import { listDatasets, getDatasetById, getDefaultDataset } from '../db/index.js'

const router = Router()

router.get('/', (req, res) => {
  try {
    const rows = listDatasets()
    res.json({ data: rows })
  } catch (err) {
    console.error('[datasets list]', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/default', (req, res) => {
  try {
    const row = getDefaultDataset()
    if (!row) return res.status(404).json({ error: '无数据集' })
    res.json({ data: row.data, id: row.id, name: row.name })
  } catch (err) {
    console.error('[datasets default]', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ error: '无效 ID' })
    const row = getDatasetById(id)
    if (!row) return res.status(404).json({ error: '数据集不存在' })
    res.json({ data: row.data, id: row.id, name: row.name })
  } catch (err) {
    console.error('[datasets get]', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
