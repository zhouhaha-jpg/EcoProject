/**
 * 实时数据弹窗面板
 * 点击顶栏数据源指示器后弹出，展示 24h 三路实时曲线：
 *  - 电价曲线 (元/kWh)
 *  - 光照辐射曲线 (W/m²)
 *  - 碳排放因子曲线 (tCO₂/kWh)
 */

import { useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { useEChart } from '@/components/charts/useEChart'
import type { DataSources } from '@/hooks/useRealtimeData'

interface Props {
  prices: number[]
  solar: number[]
  carbon: number[]
  sources: DataSources
  lastUpdated: string
  onClose: () => void
}

const HOURS = Array.from({ length: 24 }, (_, i) => `${i}:00`)

function MiniChart({ data, color, unit, label, sourceTag }: {
  data: number[]
  color: string
  unit: string
  label: string
  sourceTag: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  const max = data.length ? Math.max(...data) : 1
  const min = data.length ? Math.min(...data) : 0
  const avg = data.length ? (data.reduce((a, b) => a + b, 0) / data.length) : 0

  const option = data.length === 24 ? {
    grid: { top: 28, right: 12, bottom: 24, left: 48 },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(10,20,35,0.95)',
      borderColor: '#1e3256',
      textStyle: { color: '#e8f4ff', fontSize: 11 },
      formatter: (params: Array<{ dataIndex: number; value: number }>) => {
        const p = params[0]
        return `${p.dataIndex}:00<br/>${label}: <b style="color:${color}">${p.value} ${unit}</b>`
      },
    },
    xAxis: {
      type: 'category' as const,
      data: HOURS,
      axisLabel: { fontSize: 9, color: '#5a7a9a', interval: 3 },
      axisLine: { lineStyle: { color: '#1e3256' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { fontSize: 9, color: '#5a7a9a' },
      splitLine: { lineStyle: { color: '#1e325630' } },
    },
    series: [{
      type: 'line',
      data,
      smooth: true,
      symbol: 'none',
      lineStyle: { color, width: 2 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: color + '40' },
            { offset: 1, color: color + '05' },
          ],
        },
      },
    }],
  } : null

  useEChart(ref, option, [data])

  return (
    <div className="rounded-lg p-2.5" style={{ background: '#0a1420', border: '1px solid #1e3256' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold" style={{ color }}>{label}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
          background: 'rgba(255,255,255,0.05)',
          color: '#8899aa',
          border: '1px solid #1e3256',
        }}>
          来源: {sourceTag}
        </span>
      </div>
      {data.length === 24 ? (
        <>
          <div ref={ref} style={{ width: '100%', height: 120 }} />
          <div className="flex justify-between mt-1 text-[10px]" style={{ color: '#5a7a9a' }}>
            <span>最小: {min.toFixed(4)} {unit}</span>
            <span>均值: {avg.toFixed(4)} {unit}</span>
            <span>最大: {max.toFixed(4)} {unit}</span>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-[120px] text-xs" style={{ color: '#3d6080' }}>
          暂无数据 — 等待首次采集
        </div>
      )}
    </div>
  )
}

export default function RealtimeDataPanel({ prices, solar, carbon, sources, lastUpdated, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    // 延迟绑定避免同一次 click 立即触发关闭
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  const time = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--'

  const sourceLabels: Record<string, string> = {
    crawler: '浙江电力交易中心', simulator: 'GBM 模拟器', fallback: '浙江TOU兜底',
    openmeteo: 'Open-Meteo API', model: '风光反推模型',
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-8 z-50 rounded-lg shadow-xl"
      style={{
        width: 420,
        background: '#111b2a',
        border: '1px solid #1e3256',
        boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
      }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: '#1e3256' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: '#e8f4ff', fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}>
            实时数据监测
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
            background: 'rgba(0,212,255,0.1)',
            color: '#00d4ff',
            border: '1px solid #00d4ff40',
          }}>
            最后更新: {time}
          </span>
        </div>
        <button onClick={onClose} className="text-[#3d6080] hover:text-[#8ba9cc] transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* 三路数据曲线 */}
      <div className="p-3 space-y-2.5">
        <MiniChart
          data={prices}
          color="#ffcc00"
          unit="元/kWh"
          label="⚡ 电价曲线"
          sourceTag={sourceLabels[sources.price] || sources.price}
        />
        <MiniChart
          data={solar}
          color="#00ff88"
          unit="W/m²"
          label="☀️ 光照辐射"
          sourceTag={sourceLabels[sources.solar] || sources.solar}
        />
        <MiniChart
          data={carbon}
          color="#00d4ff"
          unit="tCO₂/kWh"
          label="🌿 碳排放因子"
          sourceTag={sourceLabels[sources.carbon] || sources.carbon}
        />
      </div>

      {/* 底部提示 */}
      <div className="px-4 py-2 border-t text-[10px]" style={{ borderColor: '#1e3256', color: '#3d6080' }}>
        以上数据将自动注入优化器，影响所有新的调度求解。每小时自动刷新，亦可通过齿轮图标修改园区坐标。
      </div>
    </div>
  )
}
