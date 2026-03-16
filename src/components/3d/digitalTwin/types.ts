import type { ParkDeviceStatus } from '../parkDeviceConfig'

export interface TwinHudMetric {
  id: string
  label: string
  value: string
  accent: string
}

export interface TwinDeviceBadge {
  id: string
  title: string
  subtitle: string
  metricLabel: string
  metricValue: string
  secondaryValue?: string
  accent: string
  status: ParkDeviceStatus
  position: [number, number, number]
}

export interface TwinFlow {
  id: string
  from: string
  to: string
  title: string
  subtitle: string
  description: string
  medium: 'power' | 'hydrogen' | 'grid' | 'storage'
  valueLabel: string
  popupPosition: [number, number, number]
  focusTarget: [number, number, number]
  focusCamera: [number, number, number]
  color: string
  value: number
  direction: 1 | -1
  status: ParkDeviceStatus
  points: [number, number, number][]
}

export interface TwinSceneSnapshot {
  strategyLabel: string
  hourLabel: string
  renewableShare: number
  storageActivity: number
  gridDependence: number
  hudMetrics: TwinHudMetric[]
  deviceBadges: Record<string, TwinDeviceBadge>
  flows: TwinFlow[]
}
