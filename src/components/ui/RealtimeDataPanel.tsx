import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useEChart } from '@/components/charts/useEChart'
import type { DataSources } from '@/hooks/useRealtimeData'

interface Props {
  prices: number[]
  solar: number[]
  carbon: number[]
  forecastMask: boolean[]
  containsForecast: boolean
  forecastFromHour: number | null
  sources: DataSources
  lastUpdated: string
  manualRefreshing: boolean
  onManualRefresh: () => Promise<void>
  onClose: () => void
}

const HOURS = Array.from({ length: 24 }, (_, index) => `${index}:00`)

function MiniChart({
  data,
  color,
  unit,
  label,
  sourceTag,
  forecastMask,
}: {
  data: number[]
  color: string
  unit: string
  label: string
  sourceTag: string
  forecastMask: boolean[]
}) {
  const ref = useRef<HTMLDivElement>(null)

  const max = data.length ? Math.max(...data) : 1
  const min = data.length ? Math.min(...data) : 0
  const avg = data.length ? (data.reduce((sum, value) => sum + value, 0) / data.length) : 0
  const actualSeries = data.map((value, index) => forecastMask[index] ? null : value)
  const forecastSeries = data.map((value, index) => forecastMask[index] ? value : null)

  const option = data.length === 24 ? {
    grid: { top: 28, right: 12, bottom: 24, left: 48 },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(10,20,35,0.95)',
      borderColor: '#1e3256',
      textStyle: { color: '#e8f4ff', fontSize: 11 },
      formatter: (params: Array<{ dataIndex: number; value: number }>) => {
        const point = params.find((item) => item.value != null) || params[0]
        return `${point.dataIndex}:00<br/>${label}: <b style="color:${color}">${point.value} ${unit}</b>`
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
    series: [
      {
        type: 'line',
        data: actualSeries,
        smooth: true,
        symbol: 'none',
        connectNulls: false,
        lineStyle: { color, width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}40` },
              { offset: 1, color: `${color}05` },
            ],
          },
        },
      },
      {
        type: 'line',
        data: forecastSeries,
        smooth: true,
        symbol: 'none',
        connectNulls: false,
        lineStyle: { color, width: 2, type: 'dashed', opacity: 0.75 },
      },
    ],
  } : null

  useEChart(ref, option, [data, forecastMask])

  return (
    <div className="rounded-lg p-2.5" style={{ background: '#0a1420', border: '1px solid #1e3256' }}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color }}>{label}</span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px]"
          style={{
            background: 'rgba(255,255,255,0.05)',
            color: '#8899aa',
            border: '1px solid #1e3256',
          }}
        >
          来源: {sourceTag}
        </span>
      </div>
      {data.length === 24 ? (
        <>
          <div ref={ref} style={{ width: '100%', height: 140 }} />
          <div className="mt-1 flex justify-between text-[10px]" style={{ color: '#5a7a9a' }}>
            <span>最小 {min.toFixed(4)} {unit}</span>
            <span>均值 {avg.toFixed(4)} {unit}</span>
            <span>最大 {max.toFixed(4)} {unit}</span>
          </div>
        </>
      ) : (
        <div className="flex h-[140px] items-center justify-center text-xs" style={{ color: '#3d6080' }}>
          暂无数据，等待下一次抓取
        </div>
      )}
    </div>
  )
}

export default function RealtimeDataPanel({
  prices,
  solar,
  carbon,
  forecastMask,
  containsForecast,
  forecastFromHour,
  sources,
  lastUpdated,
  manualRefreshing,
  onManualRefresh,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  const time = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--'

  const sourceLabels: Record<string, string> = {
    crawler: '浙江电力交易中心',
    simulator: 'GBM 模拟器',
    fallback: '浙江 TOU 兜底',
    openmeteo: 'Open-Meteo API',
    model: '风光反推模型',
  }

  const forecastLabel = containsForecast && forecastFromHour != null
    ? `${String(forecastFromHour).padStart(2, '0')}:00-23:00 为预测`
    : '当前 24h 均已落地'

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-[calc(100%+12px)] z-[160] rounded-lg shadow-xl"
      style={{
        width: 'min(560px, calc(100vw - 32px))',
        background: '#111b2a',
        border: '1px solid #1e3256',
        boxShadow: '0 18px 56px rgba(0,0,0,0.72), 0 0 28px rgba(0,212,255,0.12)',
      }}
    >
      <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: '#1e3256' }}>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold"
            style={{ color: '#e8f4ff', fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}
          >
            实时数据监测
          </span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{
              background: 'rgba(0,212,255,0.1)',
              color: '#00d4ff',
              border: '1px solid #00d4ff40',
            }}
          >
            最后更新 {time}
          </span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{
              background: containsForecast ? 'rgba(255,204,0,0.12)' : 'rgba(0,255,136,0.12)',
              color: containsForecast ? '#ffcc00' : '#00ff88',
              border: `1px solid ${containsForecast ? '#ffcc0040' : '#00ff8840'}`,
            }}
          >
            {forecastLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onManualRefresh()}
            disabled={manualRefreshing}
            className="rounded border px-2 py-1 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: '#2a4a74',
              color: manualRefreshing ? '#8ba9cc' : '#e8f4ff',
              background: manualRefreshing ? '#162338' : '#102033',
            }}
          >
            {manualRefreshing ? '抓取中...' : '立即抓取'}
          </button>
          <button onClick={onClose} className="text-[#3d6080] transition-colors hover:text-[#8ba9cc]">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="space-y-2.5 p-3">
        <MiniChart
          data={prices}
          color="#ffcc00"
          unit="元/kWh"
          label="⚡ 电价曲线"
          sourceTag={sourceLabels[sources.price] || sources.price}
          forecastMask={forecastMask}
        />
        <MiniChart
          data={solar}
          color="#00ff88"
          unit="W/m²"
          label="☀️ 光照辐射"
          sourceTag={sourceLabels[sources.solar] || sources.solar}
          forecastMask={forecastMask}
        />
        <MiniChart
          data={carbon}
          color="#00d4ff"
          unit="tCO2/kWh"
          label="🌿 碳排因子"
          sourceTag={sourceLabels[sources.carbon] || sources.carbon}
          forecastMask={forecastMask}
        />
      </div>

      <div className="border-t px-4 py-2 text-[10px]" style={{ borderColor: '#1e3256', color: '#3d6080' }}>
        实线表示已发生小时，虚线表示当天未来预测小时。页面只读取缓存；若需演示新的快照，请使用“立即抓取”。
      </div>
    </div>
  )
}
