import type { EcoDataset, StrategyKey } from '@/types'
import type { ParkDeviceConfig, ParkDeviceDetail } from '../parkDeviceConfig'
import { TWIN_COLORS, getStatusAccent } from './config'
import type { TwinFlow, TwinSceneSnapshot } from './types'

function percent(value: number, total: number) {
  if (!total) return 0
  return value / total
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function safeAt(values: number[], hourIndex: number) {
  return values[hourIndex] ?? 0
}

function formatFlowValue(value: number, medium: TwinFlow['medium']) {
  switch (medium) {
    case 'hydrogen':
      return `${value.toFixed(1)} kg/h`
    default:
      return `${value.toFixed(0)} kW`
  }
}

export function buildTwinSceneSnapshot({
  dataset,
  activeStrategy,
  hourIndex,
  strategyLabel,
  devices,
  deviceDetails,
}: {
  dataset: EcoDataset
  activeStrategy: StrategyKey
  hourIndex: number
  strategyLabel: string
  devices: ParkDeviceConfig[]
  deviceDetails: Record<string, ParkDeviceDetail>
}): TwinSceneSnapshot {
  const pvPower = safeAt(dataset.P_PV[activeStrategy], hourIndex)
  const gmPower = safeAt(dataset.P_GM[activeStrategy], hourIndex)
  const pemPower = safeAt(dataset.P_PEM[activeStrategy], hourIndex)
  const caPower = safeAt(dataset.P_CA[activeStrategy], hourIndex)
  const gridPower = safeAt(dataset.P_G[activeStrategy], hourIndex)
  const storagePower = safeAt(dataset.P_es_es, hourIndex)
  const storageLevel = safeAt(dataset.H_HS[activeStrategy], hourIndex)
  const hydrogenProd = safeAt(dataset.H_CA[activeStrategy], hourIndex) * 180000
  const hydrogenDispatch = safeAt(dataset.H_PEM[activeStrategy], hourIndex) * 180000
  const totalSupply = pvPower + gmPower + pemPower + gridPower
  const effectiveDemand = Math.max(caPower + pemPower * 0.35, 1)
  const renewableShare = clamp01(percent(pvPower + Math.max(storagePower, 0) * 0.35, Math.max(totalSupply, 1)))
  const storageActivity = clamp01(storagePower / 2200)
  const gridDependence = clamp01(percent(gridPower, Math.max(totalSupply, 1)))
  const carbonIntensity = safeAt(dataset.ef_g, hourIndex) * 1000

  const hudMetrics = [
    { id: 'supply', label: '总供能', value: `${totalSupply.toFixed(0)} kW`, accent: TWIN_COLORS.primary },
    { id: 'grid', label: '电网输入', value: `${gridPower.toFixed(0)} kW`, accent: '#ce93d8' },
    { id: 'carbon', label: '碳强度', value: `${carbonIntensity.toFixed(3)} kg/kWh`, accent: TWIN_COLORS.energy },
    { id: 'storage', label: '储氢余量', value: `${storageLevel.toFixed(3)} t`, accent: TWIN_COLORS.storage },
  ]

  const deviceBadges = Object.fromEntries(
    devices.map((device) => {
      const detail = deviceDetails[device.id]
      const primaryMetric = detail.metrics[0]
      const secondaryMetric = detail.metrics[1]
      return [
        device.id,
        {
          id: device.id,
          title: device.name,
          subtitle: detail.statusLabel,
          metricLabel: primaryMetric?.label ?? '当前指标',
          metricValue: primaryMetric?.value ?? '--',
          secondaryValue: secondaryMetric?.value,
          accent: getStatusAccent(detail.status, device.color),
          status: detail.status,
          position: [device.position[0], device.position[1] + device.size[1] + 2.3, device.position[2]] as [number, number, number],
        },
      ]
    })
  )

  const createFlow = (flow: Omit<TwinFlow, 'valueLabel'>): TwinFlow => ({
    ...flow,
    valueLabel: formatFlowValue(Math.abs(flow.value), flow.medium),
  })

  const storageCharging = storagePower >= 800

  const flows: TwinFlow[] = [
    createFlow({
      id: 'pv-hub',
      from: 'pv-field',
      to: 'hub-core',
      title: '光伏绿电流',
      subtitle: '光伏阵列 -> 能源枢纽',
      description: '白天光伏发电通过园区母线汇入能源枢纽，优先支撑园区内部供电。',
      medium: 'power',
      popupPosition: [-8.2, 5.8, 14.8],
      focusTarget: [-8.4, 4.2, 15.2],
      focusCamera: [-2.4, 8.8, 23.4],
      color: TWIN_COLORS.energy,
      value: pvPower,
      direction: 1 as const,
      status: deviceDetails['pv-field']?.status ?? 'normal',
      points: [[-18.2, 1.6, 18.4], [-18.9, 4.9, 16.2], [-15.6, 6.1, 13.2], [-9.2, 5.8, 9.4], [-0.6, 4.7, 3.1], [8, 2.6, 0.8]],
    }),
    createFlow({
      id: 'gm-hub',
      from: 'gm-unit',
      to: 'hub-core',
      title: '燃机供电流',
      subtitle: '燃机区 -> 能源枢纽',
      description: '燃气轮机输出的稳定电力接入枢纽侧母线，用于补充园区功率缺口。',
      medium: 'power',
      popupPosition: [14.4, 5.8, -3.6],
      focusTarget: [13.6, 4.2, -3.5],
      focusCamera: [19.6, 8.2, 4.8],
      color: TWIN_COLORS.storage,
      value: gmPower,
      direction: 1 as const,
      status: deviceDetails['gm-unit']?.status ?? 'normal',
      points: [[15.6, 2.2, -7.2], [18.6, 4.2, -6.8], [18.8, 5.4, -3.2], [15.1, 5.7, -1.1], [11.4, 4.8, 0.3], [8, 2.6, 0.8]],
    }),
    createFlow({
      id: 'grid-hub',
      from: 'grid-gateway',
      to: 'hub-core',
      title: '外部购电流',
      subtitle: '电网入口 -> 能源枢纽',
      description: '园区从外部电网购入的电力通过入口母线注入能源枢纽。',
      medium: 'grid',
      popupPosition: [17.8, 4.9, 0.4],
      focusTarget: [17.2, 3.5, 0.3],
      focusCamera: [22.6, 7.4, 7.2],
      color: '#ce93d8',
      value: gridPower,
      direction: 1 as const,
      status: gridDependence > 0.45 ? ('warning' as const) : ('normal' as const),
      points: [[23.3, 3.0, -2.3], [23.7, 4.4, -0.6], [21.1, 4.9, 0.9], [16.4, 4.5, 1.5], [11.8, 3.6, 1.2], [8, 2.6, 0.8]],
    }),
    createFlow({
      id: 'hub-ca',
      from: 'hub-core',
      to: 'ca-main',
      title: '主供电母线',
      subtitle: '能源枢纽 -> 氯碱电解槽区',
      description: '综合供电母线从能源枢纽分配到电解槽主厂房，支撑核心生产负荷。',
      medium: 'power',
      popupPosition: [4.4, 4.8, 2.6],
      focusTarget: [4.1, 3.4, 2.6],
      focusCamera: [8.9, 7.6, 9.6],
      color: TWIN_COLORS.primary,
      value: effectiveDemand,
      direction: 1 as const,
      status: deviceDetails['ca-main']?.status ?? 'normal',
      points: [[8, 2.6, 0.8], [7.2, 4.1, 2.4], [5.4, 4.9, 3.4], [3.2, 4.7, 4.2], [1.1, 3.5, 4.6], [0, 2.3, 3.9]],
    }),
    createFlow({
      id: 'hub-pem',
      from: 'hub-core',
      to: 'pem-unit',
      title: 'PEM 配电流',
      subtitle: '能源枢纽 -> PEM 区',
      description: '枢纽侧功率通过上层桥架送往 PEM 区，为制氢或相关电化学单元供电。',
      medium: 'power',
      popupPosition: [-2.6, 6, 6.8],
      focusTarget: [-2.2, 4.6, 6.7],
      focusCamera: [3.6, 8.8, 13.4],
      color: TWIN_COLORS.primarySoft,
      value: pemPower,
      direction: 1 as const,
      status: deviceDetails['pem-unit']?.status ?? 'normal',
      points: [[8, 2.6, 0.8], [7.4, 4.6, 3.1], [4.3, 6.2, 5.9], [-0.8, 6.1, 8.1], [-6.1, 5.2, 9.6], [-10.8, 2.4, 8.8]],
    }),
    createFlow({
      id: 'ca-hs',
      from: 'ca-main',
      to: 'hs-tank',
      title: '制氢入罐流',
      subtitle: '氯碱电解槽区 -> 储氢罐区',
      description: '电解槽副产氢经汇管提升后送入储氢罐区，进入园区氢储能缓冲环节。',
      medium: 'hydrogen',
      popupPosition: [6.6, 5.6, 6.8],
      focusTarget: [6.2, 4.2, 6.7],
      focusCamera: [11.6, 8.1, 13.6],
      color: '#8ee7ff',
      value: hydrogenProd,
      direction: 1 as const,
      status: deviceDetails['hs-tank']?.status ?? 'normal',
      points: [[0.2, 2.6, 4.1], [1.2, 4.2, 5.8], [4.2, 5.6, 6.8], [7.2, 5.9, 7.9], [9.2, 5.1, 8.7], [10.9, 3.1, 8.4]],
    }),
    createFlow({
      id: 'hs-pem',
      from: 'hs-tank',
      to: 'pem-unit',
      title: '储氢供氢流',
      subtitle: '储氢罐区 -> PEM 区',
      description: '储氢罐中的氢气经高位管廊输送到 PEM 区，支撑氢能利用或转化。',
      medium: 'hydrogen',
      popupPosition: [1.6, 7.2, 11],
      focusTarget: [1.2, 5.8, 10.8],
      focusCamera: [6.8, 10.2, 17.1],
      color: '#8a95ff',
      value: hydrogenDispatch,
      direction: 1 as const,
      status: deviceDetails['pem-unit']?.status ?? 'normal',
      points: [[10.9, 3.1, 8.4], [10.2, 5.6, 10.2], [6.4, 7.1, 11.8], [1.2, 7.4, 12.1], [-5.2, 6.7, 11.5], [-10.8, 2.5, 8.8]],
    }),
    createFlow({
      id: 'hub-es',
      from: storageCharging ? 'hub-core' : 'es-bank',
      to: storageCharging ? 'es-bank' : 'hub-core',
      title: storageCharging ? '储能充电流' : '储能放电流',
      subtitle: storageCharging ? '能源枢纽 -> 储能柜区' : '储能柜区 -> 能源枢纽',
      description: storageCharging
        ? '当前储能处于充电状态，园区富余电力经枢纽送入储能柜。'
        : '当前储能处于放电状态，储能柜向园区枢纽回送电力。',
      medium: 'storage',
      popupPosition: [13.7, 5.2, 7.2],
      focusTarget: [13.2, 3.9, 7.1],
      focusCamera: [18.6, 8.2, 13.8],
      color: TWIN_COLORS.storage,
      value: storagePower,
      direction: storageCharging ? (1 as const) : (-1 as const),
      status: deviceDetails['es-bank']?.status ?? 'standby',
      points: [[8, 2.6, 0.8], [9.2, 4.2, 3.9], [11.4, 5.2, 6.6], [13.9, 5.1, 8.6], [16.1, 4.3, 10], [17.4, 2.2, 10.7]],
    }),
  ]

  return {
    strategyLabel,
    hourLabel: `${hourIndex + 1}h`,
    renewableShare,
    storageActivity,
    gridDependence,
    hudMetrics,
    deviceBadges,
    flows,
  }
}
