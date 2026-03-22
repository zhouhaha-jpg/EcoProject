// ══════════════════════════════════════════════════════════
//  核心类型定义
// ══════════════════════════════════════════════════════════

/** 6个策略/方案标识符 */
export type StrategyKey = 'uci' | 'cicos' | 'cicar' | 'cicom' | 'pv' | 'es'

/** 策略元数据 */
export interface StrategyMeta {
  key: StrategyKey
  label: string
  fullLabel: string
  color: string
  description: string
}

/** 方案综合指标汇总 */
export interface StrategySummary {
  cost: number       // 运行成本 (元)
  carbon: number     // 碳排放 (tCO2)
  combined: number   // 综合目标函数
}

/** 24小时时序数据（index 0 = 第1小时） */
export type HourlyData = number[]

/** 电解槽功率数据（6策略 × 24小时） */
export interface PCA_Data {
  uci: HourlyData
  cicos: HourlyData
  cicar: HourlyData
  cicom: HourlyData
  pv: HourlyData
  es: HourlyData
}

export interface DatasetMeta {
  datasetType: 'realtime' | 'history' | 'seed' | 'emergency' | string
  viewDate: string
  snapshotAt: string
  isHistorical: boolean
  datasetId?: number | null
  datasetName?: string
  containsForecast?: boolean
  forecastFromHour?: number | null
  baselineDatasetId?: number | null
  emergencyRunId?: number | null
  emergencyActive?: boolean
  emergencyTitle?: string
}

export type ServerLogLevel = 'info' | 'warn' | 'ok' | 'err'

export interface ServerLogEntry {
  id: string
  time: string
  level: ServerLogLevel
  status: 'start' | 'progress' | 'done' | 'error' | 'info' | string
  scope: string
  message: string
  detail?: string
  targetDate?: string
  range?: string
  algorithm?: string
}

/** 完整数据集 */
export interface EcoDataset {
  /** 各方案成本/碳排放汇总 */
  summary: Record<StrategyKey, StrategySummary>
  /** 电解槽功率 P_CA (kW) */
  P_CA: PCA_Data
  /** 光伏功率 P_PV (kW) */
  P_PV: PCA_Data
  /** 燃气轮机功率 P_GM (kW) */
  P_GM: PCA_Data
  /** 电解水制氢 PEM 功率 P_PEM (kW) */
  P_PEM: PCA_Data
  /** 电网功率 P_G (kW) */
  P_G: PCA_Data
  /** 储能功率 P_es_es (kW，仅 es 方案有意义）*/
  P_es_es: HourlyData
  /** 碳排放因子 ef_g (tCO2/kWh) */
  ef_g: HourlyData
  /** 氯碱制氢 H_CA (kg/s) */
  H_CA: PCA_Data
  /** PEM 制氢 H_PEM (kg/s) */
  H_PEM: PCA_Data
  /** 压缩储氢 H_CH (kg/s) */
  H_CH: PCA_Data
  /** 储氢罐 H_HS (t) */
  H_HS: PCA_Data
  _meta?: DatasetMeta
}

export type EmergencyEventType =
  | 'typhoon_weather'
  | 'grid_fault_or_limit'
  | 'pv_drop'
  | 'price_surge'
  | 'carbon_surge'
  | string

export interface EmergencyEventSpec {
  type: EmergencyEventType
  title: string
  severity: 'warning' | 'critical' | string
  startHour: number
  durationHours: number
  pvReduction?: number
  gridReduction?: number
  parameterSource?: {
    gridReduction?: 'user' | 'template' | 'none' | string
    pvReduction?: 'user' | 'template' | 'none' | string
  }
  parameterSummary?: string
  priceMultiplier?: number
  carbonMultiplier?: number
  weatherNote?: string
  affectedModules?: string[]
  rawPrompt?: string
}

export interface EmergencyPointDetail {
  index: number
  label: string
  timestamp: string
  P_CA: number
  P_PV: number
  P_GM: number
  P_PEM: number
  P_G: number
  P_es_es: number
  supplyTotal: number
  gap: number
  riskLevel: 'low' | 'medium' | 'high' | string
}

export interface EmergencyDetailSeries {
  labels: string[]
  series: {
    P_CA: number[]
    P_PV: number[]
    P_GM: number[]
    P_PEM: number[]
    P_G: number[]
    P_es_es: number[]
    gap: number[]
  }
  points: EmergencyPointDetail[]
  summary: {
    peakGrid: number
    peakPEM: number
    peakGM: number
    peakStorage: number
    maxGap: number
  }
  priorityOrder: string[]
  keyAnchors: string[]
  explanation: string
  meta?: {
    generationMode?: string
    parameterSummary?: string
    parameterSource?: EmergencyEventSpec['parameterSource']
    requestedReductions?: {
      gridReduction?: number
      pvReduction?: number
    }
    actualReductions?: {
      gridReduction?: number
      pvReduction?: number
    }
    responseWindowHours?: number
    validationMessage?: string
  }
}

export interface EmergencyDatasetRef {
  id?: number | null
  name?: string
  data: EcoDataset
  meta?: DatasetMeta
}

export interface EmergencyRun {
  id: number
  title: string
  source: 'manual' | 'auto' | string
  severity: 'warning' | 'critical' | string
  status: 'planned' | 'applied' | 'restored' | string
  degraded: boolean
  baselineDatasetId?: number | null
  emergencyDatasetId?: number | null
  eventSpec: EmergencyEventSpec
  detailPayload: EmergencyDetailSeries
  explanation: string
  createdAt: string
  appliedAt?: string | null
  restoredAt?: string | null
  baselinePayload?: EmergencyDatasetRef | null
  baselineDataset?: EmergencyDatasetRef | null
  emergencyDataset?: EmergencyDatasetRef | null
}

/** 设备健康数据 */
export interface EquipmentItem {
  id: string
  name: string
  type: 'electrolyzer' | 'pem' | 'turbine' | 'storage' | 'pv'
  health: number      // 0-100
  status: 'normal' | 'warning' | 'fault'
  current: number     // kA
  temperature: number // °C
  pressure: number    // bar
  runtime: number     // hours
  efficiency: number  // 0-1
}

/** HSE 安全数据 */
export interface HSEData {
  gasLeaks: { zone: string; level: number; threshold: number; unit: string }[]
  wastewater: { indicator: string; value: number; limit: number; unit: string }[]
  alarms: { time: string; level: 'info' | 'warning' | 'critical'; message: string }[]
}

/** Context 状态 */
export interface StrategyContextValue {
  activeStrategy: StrategyKey
  setActiveStrategy: (key: StrategyKey) => void
  /** 图表曲线高亮筛选：选中的策略曲线高亮，未选中的暗淡。空集合表示全部高亮 */
  selectedStrategies: Set<StrategyKey>
  toggleStrategy: (key: StrategyKey) => void
  dataset: EcoDataset
  datasetMeta?: DatasetMeta
  strategyMeta: Record<StrategyKey, StrategyMeta>
  currentTime: Date
  datasetLoading?: boolean
  datasetError?: string | null
}

/** 前缀与页面映射：ca=电解槽, pv=光伏, gm=燃气轮机, pem=质子膜燃料电池, g=电网 */
export type PrefixKey = 'ca' | 'pv' | 'gm' | 'pem' | 'g'

/** 前缀对应的功率指标 */
export const PREFIX_TO_METRIC: Record<PrefixKey, 'P_CA' | 'P_PV' | 'P_GM' | 'P_PEM' | 'P_G'> = {
  ca: 'P_CA',
  pv: 'P_PV',
  gm: 'P_GM',
  pem: 'P_PEM',
  g: 'P_G',
}
