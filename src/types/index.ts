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
  dataset: EcoDataset
  strategyMeta: Record<StrategyKey, StrategyMeta>
  currentTime: Date
}
