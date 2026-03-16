import type { ParkDeviceStatus } from '../parkDeviceConfig'

export const TWIN_COLORS = {
  background: '#061018',
  platform: '#08121c',
  platformMid: '#0c1725',
  platformTop: '#0f1f31',
  line: '#163c57',
  lineSoft: '#103247',
  primary: '#00d7ff',
  primarySoft: '#26afff',
  energy: '#65ffb7',
  energySoft: '#5bffd1',
  storage: '#ffd740',
  storageSoft: '#ffb347',
  warning: '#ff9f43',
  danger: '#ff4d4f',
  neutral: '#152233',
  text: '#d9fdff',
  textMuted: '#7ea6c7',
} as const

export const DEFAULT_CAMERA_POSITION: [number, number, number] = [42, 28, 40]
export const DEFAULT_CAMERA_TARGET: [number, number, number] = [1, 3.2, 2]

export const PARK_BOUNDARY: [number, number, number][] = [
  [-24, 0.06, -16],
  [-10, 0.06, -18],
  [9, 0.06, -17],
  [23, 0.06, -10],
  [24, 0.06, 11],
  [11, 0.06, 18],
  [-10, 0.06, 18],
  [-24, 0.06, 10],
  [-24, 0.06, -16],
]

export const CIRCUIT_LINES: [number, number, number][][] = [
  [[-20, 0.08, -12], [-8, 0.08, -12], [-8, 0.08, -4], [1, 0.08, -4]],
  [[-12, 0.08, 14], [-2, 0.08, 14], [-2, 0.08, 8], [8, 0.08, 8]],
  [[10, 0.08, -12], [18, 0.08, -12], [18, 0.08, -3], [9, 0.08, -3]],
  [[12, 0.08, 12], [18, 0.08, 12], [18, 0.08, 6], [12, 0.08, 6]],
  [[-6, 0.08, 5], [2, 0.08, 5], [2, 0.08, 12], [10, 0.08, 12]],
]

export const OFFICE_BUILDINGS = [
  { id: 'ops-core', position: [-5.8, 2.9, -3.8] as [number, number, number], size: [5.6, 5.8, 4.6] as [number, number, number] },
  { id: 'dispatch-west', position: [-12.2, 2.2, 1.7] as [number, number, number], size: [4.2, 4.6, 4.0] as [number, number, number] },
  { id: 'admin-south', position: [-17.0, 1.7, 4.7] as [number, number, number], size: [3.5, 3.4, 3.2] as [number, number, number] },
  { id: 'data-center', position: [2.6, 3.7, -6.6] as [number, number, number], size: [6.8, 7.6, 5.2] as [number, number, number] },
  { id: 'command-north', position: [9.6, 3.0, -2.8] as [number, number, number], size: [4.9, 6.0, 3.9] as [number, number, number] },
  { id: 'lab-east', position: [13.2, 2.2, 3.6] as [number, number, number], size: [4.0, 4.4, 3.6] as [number, number, number] },
  { id: 'research-east', position: [18.0, 1.9, 0.5] as [number, number, number], size: [3.4, 3.8, 3.2] as [number, number, number] },
]

export const DATA_MARKERS = [
  { id: 'total-supply', position: [-18, 0.15, 13] as [number, number, number] },
  { id: 'renewable', position: [-2, 0.15, -14] as [number, number, number] },
  { id: 'storage', position: [17, 0.15, 13] as [number, number, number] },
]

export function getStatusAccent(status: ParkDeviceStatus, fallback: string) {
  switch (status) {
    case 'warning':
      return TWIN_COLORS.warning
    case 'focus':
      return TWIN_COLORS.primary
    case 'standby':
      return '#7a93ad'
    default:
      return fallback
  }
}
