/**
 * WebSocket 服务 — 实时数据推送与 Agent 事件
 *
 * 消息类型：
 *   { type: 'data_updated', payload }   — 实时数据更新通知
 *   { type: 'alert', payload }          — 异动预警事件
 *   { type: 'optimization_complete', payload } — 影子优化完成
 *   { type: 'health_update', payload }  — 数据源健康变更
 */

import { WebSocketServer } from 'ws'

let wss = null

/**
 * 将 WebSocket 服务挂载到 HTTP server 实例
 * @param {import('http').Server} server
 */
export function mountWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    console.log('[ws] 客户端已连接')

    ws.on('close', () => {
      console.log('[ws] 客户端已断开')
    })

    ws.on('error', (err) => {
      console.error('[ws] 错误:', err.message)
    })

    // 连接后立即发送一个 welcome 消息
    ws.send(JSON.stringify({
      type: 'connected',
      payload: { message: '实时数据通道已建立', timestamp: new Date().toISOString() },
    }))
  })

  console.log('[ws] WebSocket 服务已挂载在 /ws')
}

/**
 * 向所有已连接客户端广播消息
 * @param {string} type 消息类型
 * @param {object} payload 消息载荷
 */
export function broadcast(type, payload) {
  if (!wss) return

  const message = JSON.stringify({ type, payload })
  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(message)
    }
  }
}

/**
 * 广播数据更新
 */
export function broadcastDataUpdate(data) {
  broadcast('data_updated', data)
}

/**
 * 广播预警事件
 */
export function broadcastAlert(alert) {
  broadcast('alert', alert)
}

/**
 * 广播优化完成
 */
export function broadcastOptimizationComplete(result) {
  broadcast('optimization_complete', result)
}

/**
 * 广播健康状态更新
 */
export function broadcastHealthUpdate(health) {
  broadcast('health_update', health)
}

/**
 * 广播完整数据集更新（自动优化后推送给前端刷新所有页面图表）
 */
export function broadcastDatasetUpdated(data) {
  broadcast('dataset_updated', data)
}
