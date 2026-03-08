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

  const flows: TwinFlow[] = [
    {
      id: 'pv-hub',
      from: 'pv-field',
      to: 'hub-core',
      color: TWIN_COLORS.energy,
      value: pvPower,
      direction: 1 as const,
      status: deviceDetails['pv-field']?.status ?? 'normal',
      points: [[-18, 1.1, -7], [-11, 2.2, -6], [-1, 2.9, -3], [8, 2.3, 0.8]] as [number, number, number][],
    },
    {
      id: 'gm-hub',
      from: 'gm-unit',
      to: 'hub-core',
      color: TWIN_COLORS.storage,
      value: gmPower,
      direction: 1 as const,
      status: deviceDetails['gm-unit']?.status ?? 'normal',
      points: [[15.5, 2.1, -7], [16.8, 3.4, -4.5], [14.4, 3.1, -1.5], [8, 2.3, 0.8]] as [number, number, number][],
    },
    {
      id: 'grid-hub',
      from: 'grid-gateway',
      to: 'hub-core',
      color: '#ce93d8',
      value: gridPower,
      direction: 1 as const,
      status: gridDependence > 0.45 ? ('warning' as const) : ('normal' as const),
      points: [[24, 1.4, -2], [20.5, 2.6, -1.8], [15.6, 2.7, -0.8], [8, 2.3, 0.8]] as [number, number, number][],
    },
    {
      id: 'hub-ca',
      from: 'hub-core',
      to: 'ca-main',
      color: TWIN_COLORS.primary,
      value: effectiveDemand,
      direction: 1 as const,
      status: deviceDetails['ca-main']?.status ?? 'normal',
      points: [[8, 2.3, 0.8], [5, 2.9, 1.8], [2.2, 2.8, 2.8], [0, 2.1, 3.8]] as [number, number, number][],
    },
    {
      id: 'hub-pem',
      from: 'hub-core',
      to: 'pem-unit',
      color: TWIN_COLORS.primarySoft,
      value: pemPower,
      direction: 1 as const,
      status: deviceDetails['pem-unit']?.status ?? 'normal',
      points: [[8, 2.3, 0.8], [4.6, 3.3, 4.5], [-1.5, 3.8, 7.4], [-10.8, 2.2, 8.8]] as [number, number, number][],
    },
    {
      id: 'ca-hs',
      from: 'ca-main',
      to: 'hs-tank',
      color: '#8ee7ff',
      value: hydrogenProd,
      direction: 1 as const,
      status: deviceDetails['hs-tank']?.status ?? 'normal',
      points: [[0, 2.1, 3.8], [3.8, 3.4, 5.1], [7.6, 3.8, 6.8], [10.8, 2.9, 8.2]] as [number, number, number][],
    },
    {
      id: 'hs-pem',
      from: 'hs-tank',
      to: 'pem-unit',
      color: '#8a95ff',
      value: hydrogenDispatch,
      direction: 1 as const,
      status: deviceDetails['pem-unit']?.status ?? 'normal',
      points: [[10.8, 2.9, 8.2], [6.8, 4.2, 10.8], [1.2, 4, 11.1], [-10.8, 2.2, 8.8]] as [number, number, number][],
    },
    {
      id: 'hub-es',
      from: storagePower >= 800 ? 'hub-core' : 'es-bank',
      to: storagePower >= 800 ? 'es-bank' : 'hub-core',
      color: TWIN_COLORS.storage,
      value: storagePower,
      direction: storagePower >= 800 ? (1 as const) : (-1 as const),
      status: deviceDetails['es-bank']?.status ?? 'standby',
      points: [[8, 2.3, 0.8], [11.2, 2.8, 4.8], [14.5, 2.6, 7.7], [17.4, 1.8, 10.5]] as [number, number, number][],
    },
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
