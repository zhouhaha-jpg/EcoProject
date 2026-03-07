import type { EcoDataset, StrategyKey } from '@/types'

export type ParkDeviceType = 'ca' | 'pem' | 'pv' | 'gm' | 'hs' | 'es'
export type ParkDeviceStatus = 'normal' | 'warning' | 'focus' | 'standby'

export interface ParkDeviceConfig {
  id: string
  type: ParkDeviceType
  name: string
  subtitle: string
  route: string
  color: string
  position: [number, number, number]
  size: [number, number, number]
  focusTarget: [number, number, number]
  focusCamera: [number, number, number]
  modelPath: string
  assetKeywords: string[]
}

export interface DeviceMetricItem {
  label: string
  value: string
  tone?: string
}

export interface ParkDeviceDetail {
  id: string
  name: string
  subtitle: string
  route: string
  status: ParkDeviceStatus
  statusLabel: string
  statusDescription: string
  primarySeriesLabel: string
  metrics: DeviceMetricItem[]
  series: number[]
}

export const PARK_DEVICES: ParkDeviceConfig[] = [
  {
    id: 'ca-main',
    type: 'ca',
    name: '氯碱电解槽区',
    subtitle: '核心负荷 · 主生产单元',
    route: '/ca',
    color: '#4e9eff',
    position: [0, 1.2, 2],
    size: [12, 2.4, 8],
    focusTarget: [0, 1.4, 2],
    focusCamera: [11, 8, 14],
    modelPath: '/models/equipment/chlor-alkali-electrolyzer.glb',
    assetKeywords: ['chlor alkali electrolyzer skid', 'industrial electrolyzer stack', 'electrolysis plant'],
  },
  {
    id: 'pem-unit',
    type: 'pem',
    name: 'PEM 区',
    subtitle: '电氢转换 · 灵活调节',
    route: '/pem',
    color: '#29d4ff',
    position: [-11, 1, 8],
    size: [6, 2, 5],
    focusTarget: [-11, 1.2, 8],
    focusCamera: [-2, 7, 17],
    modelPath: '/models/equipment/pem-fuel-cell.glb',
    assetKeywords: ['PEM fuel cell skid', 'hydrogen fuel cell container', 'industrial fuel cell module'],
  },
  {
    id: 'pv-field',
    type: 'pv',
    name: '光伏阵列区',
    subtitle: '清洁电源 · 日间出力',
    route: '/pv',
    color: '#c6f135',
    position: [-17, 0.4, -3],
    size: [12, 0.8, 16],
    focusTarget: [-17, 0.6, -3],
    focusCamera: [-7, 7, 8],
    modelPath: '/models/equipment/solar-array.glb',
    assetKeywords: ['solar array tracker', 'photovoltaic field', 'solar panel industrial'],
  },
  {
    id: 'gm-unit',
    type: 'gm',
    name: '燃气轮机区',
    subtitle: '稳定热电 · 备用支撑',
    route: '/gm',
    color: '#ffb347',
    position: [15, 1.2, -6],
    size: [6, 2.4, 5],
    focusTarget: [15, 1.4, -6],
    focusCamera: [24, 8, 4],
    modelPath: '/models/equipment/gas-turbine.glb',
    assetKeywords: ['gas turbine package', 'industrial turbine skid', 'combined heat and power turbine'],
  },
  {
    id: 'hs-tank',
    type: 'hs',
    name: '储氢罐区',
    subtitle: '氢储能 · 容量缓冲',
    route: '/storage',
    color: '#ce93d8',
    position: [11, 1.8, 8],
    size: [6, 3.6, 6],
    focusTarget: [11, 2, 8],
    focusCamera: [20, 10, 18],
    modelPath: '/models/equipment/hydrogen-storage-tank.glb',
    assetKeywords: ['hydrogen storage tank', 'cryogenic storage vessel', 'industrial pressure vessel'],
  },
  {
    id: 'es-bank',
    type: 'es',
    name: '储能模块区',
    subtitle: 'ES 策略 · 调峰单元',
    route: '/storage',
    color: '#ffd740',
    position: [17, 0.9, 11],
    size: [7, 1.8, 4],
    focusTarget: [17, 1.2, 11],
    focusCamera: [25, 6, 18],
    modelPath: '/models/equipment/battery-energy-storage.glb',
    assetKeywords: ['battery energy storage container', 'BESS container', 'industrial battery cabinet'],
  },
]

function avg(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sum(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0)
}

function max(values: number[]) {
  return values.length ? Math.max(...values) : 0
}

function min(values: number[]) {
  return values.length ? Math.min(...values) : 0
}

function safeAt(values: number[], hourIndex: number) {
  return values[hourIndex] ?? 0
}

function percent(value: number, denominator: number) {
  if (!denominator) return 0
  return (value / denominator) * 100
}

function peakHour(values: number[]) {
  if (!values.length) return 1
  return values.indexOf(Math.max(...values)) + 1
}

function round(value: number, digits = 0) {
  return value.toFixed(digits)
}

function statusMeta(status: ParkDeviceStatus) {
  switch (status) {
    case 'warning':
      return {
        label: '需要关注',
        description: '当前状态偏离常态区间，建议结合下方时序走势进一步检查。',
      }
    case 'focus':
      return {
        label: '高活跃',
        description: '当前设备处于高负荷或高贡献区间，是当前策略的关键调节点。',
      }
    case 'standby':
      return {
        label: '待机',
        description: '当前策略未显著启用该设备，主要保留备用或支撑能力。',
      }
    default:
      return {
        label: '正常',
        description: '当前状态处于可接受区间，设备运行与策略目标基本一致。',
      }
  }
}

export function buildDeviceDetail(
  deviceId: string,
  dataset: EcoDataset,
  activeStrategy: StrategyKey,
  hourIndex: number
): ParkDeviceDetail {
  const config = PARK_DEVICES.find((device) => device.id === deviceId) ?? PARK_DEVICES[0]
  const safeHourIndex = Math.max(0, Math.min(23, hourIndex))
  const uciStrategy: StrategyKey = 'uci'

  switch (config.type) {
    case 'ca': {
      const series = dataset.P_CA[activeStrategy]
      const current = safeAt(series, safeHourIndex)
      const average = avg(series)
      const hydrogen = safeAt(dataset.H_CA[activeStrategy], safeHourIndex)
      const status: ParkDeviceStatus = current < average * 0.85 ? 'warning' : current > average * 1.1 ? 'focus' : 'normal'
      const meta = statusMeta(status)
      return {
        id: config.id,
        name: config.name,
        subtitle: config.subtitle,
        route: config.route,
        status,
        statusLabel: meta.label,
        statusDescription: meta.description,
        primarySeriesLabel: 'P_CA 24h 时序',
        series,
        metrics: [
          { label: '当前功率', value: `${round(current, 0)} kW`, tone: '#4e9eff' },
          { label: '日均功率', value: `${round(average, 0)} kW` },
          { label: '当前产氢', value: `${round(hydrogen, 4)} kg/s` },
          { label: '峰值时段', value: `${peakHour(series)} h` },
        ],
      }
    }
    case 'pem': {
      const series = dataset.P_PEM[activeStrategy]
      const current = safeAt(series, safeHourIndex)
      const hydrogenSeries = dataset.H_PEM[activeStrategy]
      const hydrogen = safeAt(hydrogenSeries, safeHourIndex)
      const totalHydrogen = sum(hydrogenSeries)
      const caCurrent = safeAt(dataset.P_CA[activeStrategy], safeHourIndex)
      const daytimeIndices = series.slice(7, 18)
      const daytimePeak = max(daytimeIndices)
      const status: ParkDeviceStatus = safeHourIndex >= 7 && safeHourIndex <= 17 && current <= daytimePeak * 0.05
        ? 'warning'
        : current > avg(series) * 1.2
          ? 'focus'
          : 'normal'
      const meta = statusMeta(status)
      return {
        id: config.id,
        name: config.name,
        subtitle: config.subtitle,
        route: config.route,
        status,
        statusLabel: meta.label,
        statusDescription: meta.description,
        primarySeriesLabel: 'P_PEM 24h 时序',
        series,
        metrics: [
          { label: '当前功率', value: `${round(current, 0)} kW`, tone: '#29d4ff' },
          { label: '当前制氢', value: `${round(hydrogen, 4)} kg/s` },
          { label: '日累计制氢', value: `${round(totalHydrogen, 3)} kg/s` },
          { label: '当前占比', value: `${round(percent(current, caCurrent), 1)} %` },
        ],
      }
    }
    case 'pv': {
      const series = dataset.P_PV[activeStrategy]
      const current = safeAt(series, safeHourIndex)
      const daytimeSeries = series.slice(7, 18)
      const daytimeAvg = avg(daytimeSeries)
      const peak = max(series)
      const deltaUci = current - safeAt(dataset.P_PV[uciStrategy], safeHourIndex)
      const status: ParkDeviceStatus = safeHourIndex >= 7 && safeHourIndex <= 17 && current < daytimeAvg * 0.6
        ? 'warning'
        : current >= peak * 0.9
          ? 'focus'
          : 'normal'
      const meta = statusMeta(status)
      return {
        id: config.id,
        name: config.name,
        subtitle: config.subtitle,
        route: config.route,
        status,
        statusLabel: meta.label,
        statusDescription: meta.description,
        primarySeriesLabel: 'P_PV 24h 时序',
        series,
        metrics: [
          { label: '当前出力', value: `${round(current, 0)} kW`, tone: '#c6f135' },
          { label: '白天均值', value: `${round(daytimeAvg, 0)} kW` },
          { label: '当前利用率', value: `${round(percent(current, peak), 1)} %` },
          { label: '相对 UCI', value: `${deltaUci >= 0 ? '+' : ''}${round(deltaUci, 0)} kW` },
        ],
      }
    }
    case 'gm': {
      const series = dataset.P_GM[activeStrategy]
      const current = safeAt(series, safeHourIndex)
      const average = avg(series)
      const stability = average ? (1 - Math.sqrt(avg(series.map((value) => (value - average) ** 2))) / average) * 100 : 100
      const deltaUci = current - safeAt(dataset.P_GM[uciStrategy], safeHourIndex)
      const status: ParkDeviceStatus = average && Math.abs(current - average) / average > 0.15 ? 'warning' : 'normal'
      const meta = statusMeta(status)
      return {
        id: config.id,
        name: config.name,
        subtitle: config.subtitle,
        route: config.route,
        status,
        statusLabel: meta.label,
        statusDescription: meta.description,
        primarySeriesLabel: 'P_GM 24h 时序',
        series,
        metrics: [
          { label: '当前出力', value: `${round(current, 1)} kW`, tone: '#ffb347' },
          { label: '日均出力', value: `${round(average, 1)} kW` },
          { label: '运行稳定度', value: `${round(stability, 1)} %` },
          { label: '相对 UCI', value: `${deltaUci >= 0 ? '+' : ''}${round(deltaUci, 1)} kW` },
        ],
      }
    }
    case 'hs': {
      const series = dataset.H_HS[activeStrategy]
      const current = safeAt(series, safeHourIndex)
      const maxValue = max(series)
      const ratio = percent(current, maxValue)
      const status: ParkDeviceStatus = ratio < 25 || ratio > 90 ? 'warning' : 'normal'
      const meta = statusMeta(status)
      return {
        id: config.id,
        name: config.name,
        subtitle: config.subtitle,
        route: config.route,
        status,
        statusLabel: meta.label,
        statusDescription: meta.description,
        primarySeriesLabel: 'H_HS 24h 时序',
        series,
        metrics: [
          { label: '当前储量', value: `${round(current, 3)} t`, tone: '#ce93d8' },
          { label: '最低储量', value: `${round(min(series), 3)} t` },
          { label: '最高储量', value: `${round(maxValue, 3)} t` },
          { label: '容量利用率', value: `${round(ratio, 1)} %` },
        ],
      }
    }
    case 'es':
    default: {
      const series = dataset.P_es_es
      const current = safeAt(series, safeHourIndex)
      const average = avg(series)
      const status: ParkDeviceStatus = activeStrategy !== 'es'
        ? 'standby'
        : current > average
          ? 'focus'
          : 'normal'
      const meta = statusMeta(status)
      return {
        id: config.id,
        name: config.name,
        subtitle: config.subtitle,
        route: config.route,
        status,
        statusLabel: meta.label,
        statusDescription: meta.description,
        primarySeriesLabel: 'P_es_es 24h 时序',
        series,
        metrics: [
          { label: '当前储能功率', value: `${round(current, 1)} kW`, tone: '#ffd740' },
          { label: '日均储能功率', value: `${round(average, 1)} kW` },
          { label: '最大储能功率', value: `${round(max(series), 1)} kW` },
          { label: 'ES 状态', value: activeStrategy === 'es' ? '策略激活' : '待机观察' },
        ],
      }
    }
  }
}