import { useEffect, useMemo, useRef } from 'react'
import { useEChart } from './useEChart'
import type { EmergencyDetailSeries, EmergencyPointDetail } from '@/types'

interface EmergencyDispatchChartProps {
  detail: EmergencyDetailSeries
  onPointHover?: (point: EmergencyPointDetail) => void
}

const SERIES_META = [
  { key: 'P_CA', name: '电解槽', color: '#4e9eff' },
  { key: 'P_PV', name: '光伏', color: '#c6f135' },
  { key: 'P_GM', name: '燃机', color: '#ffb347' },
  { key: 'P_PEM', name: 'PEM', color: '#29d4ff' },
  { key: 'P_G', name: '电网', color: '#ce93d8' },
  { key: 'P_es_es', name: '储能', color: '#ffd740' },
] as const

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function EmergencyDispatchChart({ detail, onPointHover }: EmergencyDispatchChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const option = useMemo(() => {
    const maxValue = Math.max(
      ...SERIES_META.flatMap(({ key }) => detail.series[key]),
      ...detail.series.gap,
      0,
    )
    const glowBase = Math.max(maxValue * 0.08, 60)
    const stageAreas = (detail.stagePlan || []).map((stage) => ([
      {
        name: stage.title,
        xAxis: detail.labels[stage.startIndex || 0],
        itemStyle: { color: 'rgba(0,212,255,0.045)' },
      },
      {
        xAxis: detail.labels[Math.min(stage.endIndex || detail.labels.length - 1, detail.labels.length - 1)],
      },
    ]))
    const peakSupportIndex = detail.points.reduce((best, point, index, points) => (
      point.P_GM + point.P_PEM + point.P_es_es > points[best].P_GM + points[best].P_PEM + points[best].P_es_es ? index : best
    ), 0)
    const peakGapIndex = detail.points.reduce((best, point, index, points) => (
      point.gap > points[best].gap ? index : best
    ), 0)

    return {
      backgroundColor: 'transparent',
      animationDuration: 250,
      grid: { top: 24, right: 20, bottom: 48, left: 64 },
      legend: {
        top: 0,
        itemWidth: 12,
        itemHeight: 8,
        textStyle: {
          color: '#8ba9cc',
          fontSize: 10,
          fontFamily: "'Share Tech Mono', monospace",
        },
        data: SERIES_META.map((item) => item.name),
      },
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: {
          type: 'cross' as const,
          lineStyle: { color: 'rgba(0,212,255,0.5)', width: 1 },
          crossStyle: { color: 'rgba(0,212,255,0.4)' },
          label: {
            backgroundColor: 'rgba(0,212,255,0.18)',
            color: '#e8f4ff',
            fontFamily: "'Share Tech Mono', monospace",
          },
        },
        backgroundColor: 'rgba(7,12,20,0.96)',
        borderColor: '#1e3256',
        textStyle: {
          color: '#e8f4ff',
          fontSize: 11,
          fontFamily: "'Share Tech Mono', monospace",
        },
        formatter: (params: Array<{ dataIndex: number }>) => {
          const point = detail.points[params?.[0]?.dataIndex ?? -1]
          if (!point) return ''
          return [
            `<div style="font-family:Rajdhani,sans-serif;font-size:14px;color:#00d4ff;margin-bottom:6px">${point.label}</div>`,
            `电解槽: ${point.P_CA.toFixed(1)} kW`,
            `光伏: ${point.P_PV.toFixed(1)} kW`,
            `燃机: ${point.P_GM.toFixed(1)} kW`,
            `PEM: ${point.P_PEM.toFixed(1)} kW`,
            `电网: ${point.P_G.toFixed(1)} kW`,
            `储能: ${point.P_es_es.toFixed(1)} kW`,
            `供能总量: ${point.supplyTotal.toFixed(1)} kW`,
            `缺口: <span style="color:${point.gap > 25 ? '#ff7043' : '#69f0ae'}">${point.gap.toFixed(1)} kW</span>`,
          ].join('<br/>')
        },
      },
      xAxis: {
        type: 'category' as const,
        data: detail.labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: {
          color: '#5a7a9a',
          fontSize: 9,
          interval: 5,
          fontFamily: "'Share Tech Mono', monospace",
        },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: '#111b2e', type: 'dashed' as const } },
      },
      yAxis: {
        type: 'value' as const,
        min: 0,
        axisLine: { lineStyle: { color: '#1e3256' } },
        axisLabel: {
          color: '#5a7a9a',
          fontSize: 9,
          fontFamily: "'Share Tech Mono', monospace",
          formatter: (value: number) => `${value.toFixed(0)}`,
        },
        splitLine: { lineStyle: { color: '#111b2e', type: 'dashed' as const } },
        axisTick: { show: false },
      },
      series: [
        {
          name: '__glow__',
          type: 'line' as const,
          data: detail.labels.map(() => glowBase),
          symbol: 'none',
          silent: true,
          z: 0,
          lineStyle: { opacity: 0, width: 0 },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0,212,255,0.14)' },
                { offset: 1, color: 'rgba(0,212,255,0)' },
              ],
            },
          },
          markArea: stageAreas.length
            ? {
                silent: true,
                label: {
                  color: '#3d6080',
                  fontSize: 9,
                },
                data: stageAreas,
              }
            : undefined,
          tooltip: { show: false },
        },
        ...(detail.baselineSeries
          ? SERIES_META.map(({ key, name, color }) => ({
              name: `${name}基线`,
              type: 'line' as const,
              data: detail.baselineSeries?.[key] ?? [],
              symbol: 'none',
              silent: true,
              z: 1,
              lineStyle: {
                width: 1,
                type: 'dashed' as const,
                color: hexToRgba(color, 0.5),
                opacity: 0.65,
              },
              itemStyle: { color },
              tooltip: { show: false },
            }))
          : []),
        ...SERIES_META.map(({ key, name, color }) => ({
          name,
          type: 'line' as const,
          data: detail.series[key],
          smooth: 0.28,
          symbol: 'none',
          z: 2,
          lineStyle: {
            width: 2,
            color,
            shadowBlur: 8,
            shadowColor: hexToRgba(color, 0.2),
          },
          itemStyle: { color },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: hexToRgba(color, 0.18) },
                { offset: 1, color: hexToRgba(color, 0.01) },
              ],
            },
          },
          emphasis: {
            focus: 'series' as const,
            lineStyle: {
              width: 3.6,
              opacity: 1,
              shadowBlur: 18,
              shadowColor: hexToRgba(color, 0.45),
            },
            areaStyle: { opacity: 0.3 },
          },
          markPoint: key === 'P_CA'
            ? {
                symbolSize: 38,
                itemStyle: { color: '#00d4ff', borderColor: '#081320', borderWidth: 1.5 },
                label: {
                  color: '#081320',
                  fontSize: 9,
                  formatter: ({ data }: { data?: { name?: string } }) => data?.name || '',
                },
                data: [
                  {
                    name: '支撑峰值',
                    coord: [detail.labels[peakSupportIndex], detail.series.P_CA[peakSupportIndex]],
                  },
                  {
                    name: '缺口点',
                    coord: [detail.labels[peakGapIndex], detail.series.P_CA[peakGapIndex]],
                  },
                ],
              }
            : undefined,
          blur: {
            lineStyle: { opacity: 0.18 },
            areaStyle: { opacity: 0.04 },
          },
        })),
      ],
    }
  }, [detail])

  const chartRef = useEChart(containerRef, option, [detail])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !onPointHover) return

    const emitByIndex = (index: number) => {
      const point = detail.points[index]
      if (point) onPointHover(point)
    }

    const handler = (event: unknown) => {
      const axisEvent = event as { axesInfo?: Array<{ value?: number | string }> }
      const rawValue = axisEvent?.axesInfo?.[0]?.value
      const index = typeof rawValue === 'string'
        ? (Number.isFinite(Number(rawValue)) ? Number(rawValue) : detail.labels.indexOf(rawValue))
        : rawValue
      if (typeof index === 'number' && Number.isFinite(index) && index >= 0) {
        emitByIndex(index)
      }
    }

    chart.on('updateAxisPointer', handler)
    return () => {
      chart.off('updateAxisPointer', handler)
    }
  }, [chartRef, detail, onPointHover])

  return <div ref={containerRef} className="h-full min-h-[300px] w-full" />
}
