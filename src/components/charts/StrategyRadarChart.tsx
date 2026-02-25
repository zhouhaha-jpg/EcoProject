import { useRef, useMemo } from 'react'
import { useStrategy } from '@/context/StrategyContext'
import { useEChart } from './useEChart'
import type { StrategyKey } from '@/types'

const INDICATORS = [
  { name: '经济性', max: 1 },
  { name: '低碳性', max: 1 },
  { name: '综合目标', max: 1 },
  { name: '氢气产量', max: 1 },
  { name: '可再生率', max: 1 },
]

function normalize(dataset: ReturnType<typeof useStrategy>['dataset'], key: StrategyKey) {
  const summary = dataset.summary[key]
  // flip cost & carbon (lower = better => higher score)
  const costs = [203969.81, 202486.53, 203172.75, 202905.61, 188709.77, 182010.89]
  const carbons = [297.06, 301.72, 295.84, 295.93, 284.25, 266.22]
  const eco = 1 - (summary.cost - Math.min(...costs)) / (Math.max(...costs) - Math.min(...costs))
  const carbon = 1 - (summary.carbon - Math.min(...carbons)) / (Math.max(...carbons) - Math.min(...carbons))
  const combined = 1 - (summary.combined - 0.91) / (1.02 - 0.91)
  // H2 total production from H_PEM
  const h2 = (dataset.H_PEM[key].reduce((a: number, b: number) => a + b, 0)) / 8000
  // PV ratio: P_PV / P_CA
  const pv = Math.min(dataset.P_PV[key].reduce((a: number, b: number) => a + b, 0) / 140000, 1)
  return [+eco.toFixed(3), +carbon.toFixed(3), +combined.toFixed(3), +h2.toFixed(3), +pv.toFixed(3)]
}

export default function StrategyRadarChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { activeStrategy, dataset, strategyMeta } = useStrategy()

  const option = useMemo(() => {
    const values = normalize(dataset, activeStrategy)
    const meta = strategyMeta[activeStrategy]

    return {
      radar: {
        indicator: INDICATORS,
        shape: 'polygon',
        splitNumber: 4,
        axisName: { color: '#8BA9CC', fontSize: 11 },
        splitLine: { lineStyle: { color: '#1A3350' } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: '#1A3350' } },
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0A1628',
        borderColor: '#00F3FF33',
        textStyle: { color: '#8BA9CC', fontSize: 11 },
      },
      series: [{
        type: 'radar',
        data: [{
          name: meta.label,
          value: values,
          lineStyle: { color: meta.color, width: 2 },
          itemStyle: { color: meta.color },
          areaStyle: { color: meta.color, opacity: 0.15 },
        }],
      }],
    }
  }, [activeStrategy, dataset, strategyMeta])

  useEChart(containerRef, option, [activeStrategy])

  return <div ref={containerRef} className="w-full h-full" />
}
