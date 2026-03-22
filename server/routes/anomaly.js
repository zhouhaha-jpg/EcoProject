import { Router } from 'express'
import {
  applyAnomalyRun,
  createAnomalyDispatch,
  getSerializedAnomalyRun,
  listSerializedAnomalyRuns,
  restoreAnomalyState,
} from '../services/anomalyDispatch.js'

const router = Router()

router.post('/dispatch', async (req, res) => {
  try {
    const run = await createAnomalyDispatch({
      prompt: req.body.prompt,
      eventSpec: req.body.eventSpec,
      baselineDataset: req.body.baselineDataset,
      baselineMeta: req.body.baselineMeta,
      baselineDatasetId: req.body.baselineDatasetId,
      activeStrategy: req.body.activeStrategy,
      source: req.body.source || 'manual',
    })
    res.json({ run })
  } catch (error) {
    console.error('[anomaly/dispatch]', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/runs', (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100)
    res.json({ data: listSerializedAnomalyRuns(limit) })
  } catch (error) {
    console.error('[anomaly/runs]', error)
    res.status(500).json({ error: error.message })
  }
})

router.get('/runs/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (Number.isNaN(id)) return res.status(400).json({ error: '无效异常方案 ID' })
    const run = getSerializedAnomalyRun(id)
    if (!run) return res.status(404).json({ error: '异常方案不存在' })
    res.json({ run })
  } catch (error) {
    console.error('[anomaly/run]', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/runs/:id/apply', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (Number.isNaN(id)) return res.status(400).json({ error: '无效异常方案 ID' })
    res.json(applyAnomalyRun(id))
  } catch (error) {
    console.error('[anomaly/apply]', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/restore', (req, res) => {
  try {
    const runId = req.body?.runId != null ? parseInt(String(req.body.runId), 10) : null
    res.json(restoreAnomalyState(Number.isNaN(runId) ? null : runId))
  } catch (error) {
    console.error('[anomaly/restore]', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
