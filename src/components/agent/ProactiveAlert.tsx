/**
 * Agent 主动预警弹窗
 *
 * 当后端检测到市场异动（电价尖峰/碳排突变）并完成影子优化后，
 * 通过 WebSocket 推送到前端，在 Agent 侧边栏顶部弹出预警卡片。
 *
 * 交互：
 * - 一键应用方案 → 加载影子优化结果到 scenarioDataset → 跳转工作区
 * - 查看详情 → 打开 Agent 工作区
 * - 忽略 → 关闭弹窗
 */

import { useState } from 'react'
import { AlertTriangle, X, Zap, CheckCircle } from 'lucide-react'
import type { ShadowOptimization, AlertEvent } from '@/hooks/useRealtimeData'

interface Props {
  shadowOptimization: ShadowOptimization | null
  alerts: AlertEvent[]
  onApplyOptimization: (opt: ShadowOptimization) => void
  onDismissOptimization: () => void
  onDismissAlert: (index: number) => void
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: string; glow: string }> = {
  critical: {
    bg: 'rgba(255, 50, 50, 0.08)',
    border: '#ff3232',
    icon: '#ff3232',
    glow: '0 0 20px rgba(255,50,50,0.3)',
  },
  warning: {
    bg: 'rgba(255, 180, 0, 0.08)',
    border: '#ffb400',
    icon: '#ffb400',
    glow: '0 0 20px rgba(255,180,0,0.2)',
  },
  info: {
    bg: 'rgba(0, 180, 255, 0.08)',
    border: '#00b4ff',
    icon: '#00b4ff',
    glow: 'none',
  },
}

export default function ProactiveAlert({
  shadowOptimization,
  alerts,
  onApplyOptimization,
  onDismissOptimization,
  onDismissAlert,
}: Props) {
  const [appliedId, setAppliedId] = useState<number | null>(null)

  if (!shadowOptimization && alerts.length === 0) return null

  return (
    <div className="flex flex-col gap-2 mb-3">
      {/* 影子优化卡片 */}
      {shadowOptimization && (
        <div
          className="relative rounded-lg p-3 animate-pulse-once"
          style={{
            background: SEVERITY_STYLES.critical.bg,
            border: `1px solid ${SEVERITY_STYLES.critical.border}`,
            boxShadow: SEVERITY_STYLES.critical.glow,
          }}
        >
          <button
            className="absolute top-2 right-2 opacity-50 hover:opacity-100"
            onClick={onDismissOptimization}
          >
            <X size={14} color="#888" />
          </button>

          <div className="flex items-start gap-2 mb-2">
            <Zap size={16} color={SEVERITY_STYLES.critical.icon} className="mt-0.5 shrink-0" />
            <div className="text-xs" style={{ color: '#e8f4ff' }}>
              <span className="font-semibold" style={{ color: SEVERITY_STYLES.critical.icon }}>
                ⚡ 市场异动 — 已自动重新优化
              </span>
            </div>
          </div>

          <p className="text-xs leading-relaxed mb-2" style={{ color: '#b0c4d8' }}>
            {shadowOptimization.suggestion}
          </p>

          <div className="flex gap-2">
            {appliedId !== shadowOptimization.datasetId ? (
              <button
                className="flex-1 text-xs py-1.5 px-3 rounded font-medium"
                style={{
                  background: 'rgba(0, 212, 255, 0.15)',
                  border: '1px solid #00d4ff',
                  color: '#00d4ff',
                }}
                onClick={() => {
                  onApplyOptimization(shadowOptimization)
                  setAppliedId(shadowOptimization.datasetId)
                }}
              >
                一键应用方案
              </button>
            ) : (
              <div className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 px-3 rounded"
                style={{ color: '#00ff88' }}>
                <CheckCircle size={12} />
                已应用
              </div>
            )}
            <button
              className="text-xs py-1.5 px-3 rounded"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid #334',
                color: '#8899aa',
              }}
              onClick={onDismissOptimization}
            >
              忽略
            </button>
          </div>
        </div>
      )}

      {/* 普通预警列表（最多显示 3 条） */}
      {alerts.slice(0, 3).map((alert, i) => {
        const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info
        return (
          <div
            key={`${alert.event_type}-${i}`}
            className="relative rounded-lg p-2.5"
            style={{
              background: style.bg,
              border: `1px solid ${style.border}40`,
            }}
          >
            <button
              className="absolute top-1.5 right-1.5 opacity-40 hover:opacity-100"
              onClick={() => onDismissAlert(i)}
            >
              <X size={12} color="#888" />
            </button>
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} color={style.icon} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium" style={{ color: style.icon }}>
                  {alert.title}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
