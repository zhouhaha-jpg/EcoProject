import { WebSocketServer } from 'ws'
import { formatBeijingDateTime } from './lib/time.js'

let wss = null
let logSeq = 0

const MAX_SERVER_LOGS = 200
const serverLogs = []

function normalizeLog(entry) {
  return {
    id: entry.id ?? `log-${Date.now()}-${logSeq++}`,
    time: entry.time ?? formatBeijingDateTime(),
    level: entry.level ?? 'info',
    status: entry.status ?? 'info',
    scope: entry.scope ?? 'system',
    message: entry.message ?? '',
    detail: entry.detail ?? '',
    targetDate: entry.targetDate ?? '',
    range: entry.range ?? '',
    algorithm: entry.algorithm ?? '',
  }
}

export function mountWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    console.log('[ws] client connected')

    ws.on('close', () => {
      console.log('[ws] client disconnected')
    })

    ws.on('error', (err) => {
      console.error('[ws] error:', err.message)
    })

    ws.send(JSON.stringify({
      type: 'connected',
      payload: { message: 'realtime channel ready', timestamp: new Date().toISOString() },
    }))

    ws.send(JSON.stringify({
      type: 'server_logs_snapshot',
      payload: getServerLogs(),
    }))
  })

  console.log('[ws] mounted on /ws')
}

export function broadcast(type, payload) {
  if (!wss) return

  const message = JSON.stringify({ type, payload })
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(message)
    }
  }
}

export function getServerLogs() {
  return [...serverLogs]
}

export function pushServerLog(entry) {
  const log = normalizeLog(entry)
  serverLogs.unshift(log)
  if (serverLogs.length > MAX_SERVER_LOGS) {
    serverLogs.length = MAX_SERVER_LOGS
  }
  broadcast('server_log', log)
  return log
}

export function broadcastDataUpdate(data) {
  broadcast('data_updated', data)
}

export function broadcastAlert(alert) {
  broadcast('alert', alert)
}

export function broadcastOptimizationComplete(result) {
  broadcast('optimization_complete', result)
}

export function broadcastHealthUpdate(health) {
  broadcast('health_update', health)
}

export function broadcastDatasetUpdated(data) {
  broadcast('dataset_updated', data)
}
