import { useEffect, useMemo, useState } from 'react'
import AnomalyDispatchChart from '@/components/charts/AnomalyDispatchChart'
import {
  applyAnomalyRunApi,
  fetchAnomalyRuns,
  restoreAnomalyStateApi,
} from '@/lib/api'
import type { AnomalyRun, DatasetMeta, EmergencyModuleStatus, EmergencyRiskCell } from '@/types'

interface AnomalyWorkspaceViewProps {
  run: AnomalyRun
  currentAppliedRunId?: number | null
  onSelectRun: (run: AnomalyRun) => void
  onApplyRun: (run: AnomalyRun, dataset?: Record<string, unknown>, meta?: DatasetMeta) => void
  onRestore: (baselineData?: Record<string, unknown>, baselineMeta?: DatasetMeta, run?: AnomalyRun | null) => void
}

export default function AnomalyWorkspaceView({
  run,
  currentAppliedRunId,
  onSelectRun,
  onApplyRun,
  onRestore,
}: AnomalyWorkspaceViewProps) {
  const [history, setHistory] = useState<AnomalyRun[]>([])

  useEffect(() => {
    let disposed = false
    void fetchAnomalyRuns(8).then((rows) => {
      if (!disposed) setHistory(rows)
    }).catch((error) => {
      console.warn('[anomaly history]', error)
    })
    return () => { disposed = true }
  }, [run.id])

  const mergedHistory = useMemo(() => {
    const ids = new Set([run.id])
    return [run, ...history.filter((item) => !ids.has(item.id))]
  }, [history, run])

  const detail = run.detailPayload
  const applied = currentAppliedRunId === run.id

  return (
    <div className="h-full min-h-0 overflow-auto" style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 12 }}>
      <div className="panel">
        <div className="panel-title-bar flex items-center justify-between">
          <span>EcoClaw · 设备异常指挥舱</span>
          <span style={{ color: '#5a7a9a', fontSize: 10 }}>{run.createdAt}</span>
        </div>
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
          <div>
            <div style={{ color: '#e8f4ff', fontSize: 16, fontWeight: 700 }}>{run.title}</div>
            <div style={{ color: '#8ba9cc', fontSize: 12, marginTop: 8, lineHeight: 1.8 }}>{run.explanation}</div>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              <Badge label={run.eventSpec.deviceType.toUpperCase()} tone="info" />
              <Badge label={run.eventSpec.anomalyType} tone="warn" />
              <Badge label={run.eventSpec.triggerSource} tone="ok" />
              <Badge label={run.severity} tone="warn" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <MetricCard label="异常设备降载" value={`${detail.summary.affectedDrop.toFixed(0)}%`} accent="#ff7b72" />
            <MetricCard label="燃机补偿" value={`+${detail.summary.gmLift.toFixed(0)}%`} accent="#ffb347" />
            <MetricCard label="PEM补偿" value={`+${detail.summary.pemLift.toFixed(0)}%`} accent="#29d4ff" />
            <MetricCard label="储能补偿" value={`+${detail.summary.storageLift.toFixed(0)}%`} accent="#ffd740" />
            <MetricCard label="最大缺口" value={`${detail.summary.peakGap.toFixed(1)} kW`} accent="#69f0ae" />
            <MetricCard label="当前状态" value={applied ? '已应用' : '预览中'} accent={applied ? '#69f0ae' : '#00d4ff'} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.85fr', gap: 12 }}>
        <div className="panel">
          <div className="panel-title-bar">异常指标与联动调度曲线</div>
          <div style={{ height: 430, padding: 12 }}>
            <AnomalyDispatchChart detail={detail} />
          </div>
        </div>
        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="panel-title-bar">模块状态灯</div>
          <div style={{ padding: 16, display: 'grid', gap: 8, maxHeight: 430, overflowY: 'auto' }}>
            {detail.moduleStatus.map((status) => <ModuleLamp key={status.module} status={status} />)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.9fr', gap: 12 }}>
        <div className="panel">
          <div className="panel-title-bar">处置时间线</div>
          <div style={{ padding: 16, display: 'grid', gap: 10 }}>
            {detail.timeline.map((item) => (
              <div key={`${item.time}-${item.title}`} style={{ borderLeft: '2px solid #00d4ff55', paddingLeft: 12 }}>
                <div style={{ color: '#00d4ff', fontSize: 11, fontWeight: 700 }}>{item.time} · {item.title}</div>
                <div style={{ color: '#8ba9cc', fontSize: 12, marginTop: 4 }}>{item.detail}</div>
                {item.action ? <div style={{ color: '#5a7a9a', fontSize: 10, marginTop: 4 }}>动作：{item.action}</div> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title-bar">风险热区</div>
          <div style={{ padding: 16 }}>
            <RiskMatrixTable items={detail.riskMatrix} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-title-bar">操作与历史复用</div>
          <div style={{ padding: 16, display: 'grid', gap: 10 }}>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded border border-[#00d4ff] bg-[#00d4ff]/12 px-3 py-2 text-xs text-[#00d4ff]"
                disabled={applied}
                onClick={async () => {
                  const appliedRun = await applyAnomalyRunApi(run.id)
                  onApplyRun(appliedRun.run, appliedRun.dataset.data, appliedRun.dataset.meta)
                }}
              >
                {applied ? '当前已应用' : '一键应用异常态'}
              </button>
              <button
                type="button"
                className="rounded border border-[#ff7043] bg-[#ff7043]/10 px-3 py-2 text-xs text-[#ffb199]"
                onClick={async () => {
                  const restored = await restoreAnomalyStateApi(run.id)
                  onRestore(restored.baselineDataset.data, restored.baselineDataset.meta, restored.run)
                }}
              >
                回退正常状态
              </button>
            </div>

            <div style={{ color: '#5a7a9a', fontSize: 11, marginTop: 4 }}>历史异常方案</div>
            <div style={{ display: 'grid', gap: 8, maxHeight: 210, overflowY: 'auto' }}>
              {mergedHistory.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectRun(item)}
                  className="rounded border px-3 py-2 text-left transition-colors hover:border-[#00d4ff]/60 hover:bg-[#00d4ff]/6"
                  style={{
                    borderColor: item.id === run.id ? '#00d4ff55' : '#1e3256',
                    background: item.id === run.id ? 'rgba(0,212,255,0.08)' : 'transparent',
                  }}
                >
                  <div style={{ color: '#e8f4ff', fontSize: 12, fontWeight: 600 }}>{item.title}</div>
                  <div style={{ color: '#5a7a9a', fontSize: 10, marginTop: 4 }}>#{item.id} · {item.status} · {item.createdAt}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="panel" style={{ padding: 12 }}>
      <div style={{ color: '#5a7a9a', fontSize: 10 }}>{label}</div>
      <div style={{ color: accent, fontFamily: "'Rajdhani', sans-serif", fontSize: 22, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </div>
  )
}

function Badge({ label, tone }: { label: string; tone: 'ok' | 'info' | 'warn' }) {
  const palette = tone === 'warn'
    ? { color: '#ffb199', border: '#ff704355', bg: 'rgba(255,112,67,0.12)' }
    : tone === 'ok'
      ? { color: '#69f0ae', border: '#69f0ae55', bg: 'rgba(105,240,174,0.12)' }
      : { color: '#00d4ff', border: '#00d4ff55', bg: 'rgba(0,212,255,0.12)' }
  return (
    <span style={{ fontSize: 10, color: palette.color, border: `1px solid ${palette.border}`, background: palette.bg, borderRadius: 6, padding: '3px 8px' }}>
      {label}
    </span>
  )
}

function ModuleLamp({ status }: { status: EmergencyModuleStatus }) {
  const color = status.level === 'red' ? '#ff7043' : status.level === 'amber' ? '#ffd740' : '#69f0ae'
  return (
    <div className="rounded border" style={{ borderColor: `${color}33`, background: `${color}10`, padding: 10 }}>
      <div className="flex items-center gap-2">
        <span style={{ width: 8, height: 8, borderRadius: '999px', background: color, boxShadow: `0 0 14px ${color}` }} />
        <span style={{ color: '#e8f4ff', fontSize: 12, fontWeight: 600 }}>{status.module}</span>
        <span style={{ color, fontSize: 10 }}>{status.title}</span>
      </div>
      <div style={{ color: '#8ba9cc', fontSize: 11, marginTop: 6 }}>{status.detail}</div>
      <div style={{ color: '#5a7a9a', fontSize: 10, marginTop: 4 }}>
        当前值：{status.currentValue?.toFixed(1) ?? '--'} {status.unit ?? ''}
      </div>
      {status.suggestion ? <div style={{ color: '#69f0ae', fontSize: 10, marginTop: 4 }}>建议：{status.suggestion}</div> : null}
    </div>
  )
}

function RiskMatrixTable({ items }: { items: EmergencyRiskCell[] }) {
  const modules = Array.from(new Set(items.map((item) => item.module)))
  const windows = Array.from(new Set(items.map((item) => item.windowLabel)))
  return (
    <table className="w-full border-collapse" style={{ fontSize: 11 }}>
      <thead>
        <tr>
          <th style={headStyle}>模块</th>
          {windows.map((window) => <th key={window} style={headStyle}>{window}</th>)}
        </tr>
      </thead>
      <tbody>
        {modules.map((module) => (
          <tr key={module}>
            <td style={cellStyle}>{module}</td>
            {windows.map((window) => {
              const cell = items.find((item) => item.module === module && item.windowLabel === window)
              const color = cell?.level === 'high' ? '#ff7043' : cell?.level === 'medium' ? '#ffd740' : '#69f0ae'
              return (
                <td key={`${module}-${window}`} style={{ ...cellStyle, color, background: `${color}12` }}>
                  <div style={{ fontWeight: 700 }}>{cell?.score ?? '--'}</div>
                  <div style={{ color: '#5a7a9a', fontSize: 10 }}>{cell?.reason ?? '--'}</div>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const headStyle = {
  padding: '8px 10px',
  borderBottom: '1px solid #1e3256',
  color: '#8ba9cc',
  textAlign: 'center' as const,
}

const cellStyle = {
  padding: '8px 10px',
  borderBottom: '1px solid #111b2e',
  textAlign: 'center' as const,
  verticalAlign: 'top' as const,
}
