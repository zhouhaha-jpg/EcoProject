import { Router } from 'express'
import {
  createInvestmentPlan,
  getSerializedInvestmentRun,
  listSerializedInvestmentRuns,
} from '../services/investmentPlanning.js'

const router = Router()

router.post('/plan', async (req, res) => {
  try {
    const run = await createInvestmentPlan({
      prompt: req.body.prompt,
      assumptions: req.body.assumptions,
      baselineDataset: req.body.baselineDataset,
      baselineMeta: req.body.baselineMeta,
      baselineDatasetId: req.body.baselineDatasetId,
      activeStrategy: req.body.activeStrategy,
      source: req.body.source || 'manual',
    })
    res.json({ run })
  } catch (error) {
    console.error('[investment/plan]', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/runs', (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100)
    res.json({ data: listSerializedInvestmentRuns(limit) })
  } catch (error) {
    console.error('[investment/runs]', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/runs/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (Number.isNaN(id)) return res.status(400).json({ error: '无效投资方案 ID' })
    const run = getSerializedInvestmentRun(id)
    if (!run) return res.status(404).json({ error: '投资方案不存在' })
    res.json({ run })
  } catch (error) {
    console.error('[investment/run]', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
