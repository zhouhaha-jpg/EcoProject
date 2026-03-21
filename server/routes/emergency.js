import { Router } from 'express'
import {
  applyEmergencyRun,
  createEmergencyDispatch,
  getSerializedEmergencyRun,
  listSerializedEmergencyRuns,
  restoreEmergencyState,
} from '../services/emergencyDispatch.js'

export default function createEmergencyRouter(options = {}) {
  const router = Router()

  router.post('/dispatch', async (req, res) => {
    try {
      const run = await createEmergencyDispatch({
        prompt: req.body.prompt,
        eventSpec: req.body.eventSpec,
        baselineDataset: req.body.baselineDataset,
        baselineMeta: req.body.baselineMeta,
        baselineDatasetId: req.body.baselineDatasetId,
        activeStrategy: req.body.activeStrategy,
        source: req.body.source || 'manual',
      }, {
        planner: options.planner,
        broadcast: req.body.broadcast !== false,
      })
      res.json({ run })
    } catch (error) {
      console.error('[emergency/dispatch]', error)
      res.status(500).json({ error: error.message })
    }
  })

  router.get('/runs', (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100)
      res.json({ data: listSerializedEmergencyRuns(limit) })
    } catch (error) {
      console.error('[emergency/runs]', error)
      res.status(500).json({ error: error.message })
    }
  })

  router.get('/runs/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10)
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: '无效应急预案 ID' })
      }
      const run = getSerializedEmergencyRun(id)
      if (!run) {
        return res.status(404).json({ error: '应急预案不存在' })
      }
      res.json({ run })
    } catch (error) {
      console.error('[emergency/run]', error)
      res.status(500).json({ error: error.message })
    }
  })

  router.post('/runs/:id/apply', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10)
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: '无效应急预案 ID' })
      }
      res.json(applyEmergencyRun(id))
    } catch (error) {
      console.error('[emergency/apply]', error)
      res.status(500).json({ error: error.message })
    }
  })

  router.post('/restore', (req, res) => {
    try {
      const runId = req.body?.runId != null ? parseInt(String(req.body.runId), 10) : null
      res.json(restoreEmergencyState(Number.isNaN(runId) ? null : runId))
    } catch (error) {
      console.error('[emergency/restore]', error)
      res.status(500).json({ error: error.message })
    }
  })

  return router
}
