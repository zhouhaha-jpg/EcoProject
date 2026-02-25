import { useRef, useEffect, type RefObject } from 'react'
import * as echarts from 'echarts/core'
import {
  BarChart, LineChart, RadarChart, ScatterChart,
} from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent,
  TitleComponent, RadarComponent, MarkLineComponent,
  DataZoomComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

echarts.use([
  BarChart, LineChart, RadarChart, ScatterChart,
  GridComponent, TooltipComponent, LegendComponent,
  TitleComponent, RadarComponent, MarkLineComponent,
  DataZoomComponent,
  CanvasRenderer,
])

const BASE_THEME: Partial<EChartsCoreOption> = {
  backgroundColor: 'transparent',
  textStyle: { color: '#8BA9CC', fontFamily: 'Rajdhani, Noto Sans SC, sans-serif' },
}

export function useEChart(
  containerRef: RefObject<HTMLDivElement | null>,
  option: EChartsCoreOption | null,
  deps: unknown[] = [],
) {
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current, null, { renderer: 'canvas' })
    }
    const chart = chartRef.current

    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef])

  useEffect(() => {
    if (!chartRef.current || !option) return
    chartRef.current.setOption({ ...BASE_THEME, ...option }, { replaceMerge: ['series'] })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option, ...deps])

  useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  return chartRef
}
