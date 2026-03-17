/**
 * 总览页：左侧趋势缩略图 + 中央 3D 园区主视图 + 右侧信息面板
 */
import { Suspense, lazy, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Activity, BatteryCharging, Factory, Gauge, Leaf, TriangleAlert } from 'lucide-react'
import { useStrategy } from '@/context/StrategyContext'
import type { PrefixKey } from '@/types'
import { PREFIX_TO_METRIC } from '@/types'
import MetricSparkline from '@/components/3d/MetricSparkline'
import { PARK_DEVICES, buildDeviceDetail, type ParkDeviceStatus } from '@/components/3d/parkDeviceConfig'
import { buildTwinSceneSnapshot } from '@/components/3d/digitalTwin/buildSnapshot'

const Park3DScene = lazy(() => import('@/components/3d/Park3DScene'))

const PREFIX_ORDER: PrefixKey[] = ['ca', 'pv', 'gm', 'pem', 'g']

const PREFIX_LABELS: Record<PrefixKey, string> = {
  ca: '电解槽',
  pv: '光伏',
  gm: '燃气轮机',
  pem: 'PEM',
  g: '电网',
}

const STATUS_STYLE: Record<ParkDeviceStatus, { label: string; color: string; border: string }> = {
  normal: { label: 'NORMAL', color: '#69f0ae', border: 'rgba(105,240,174,0.32)' },
  warning: { label: 'WARNING', color: '#ff7043', border: 'rgba(255,112,67,0.32)' },
  focus: { label: 'FOCUS', color: '#00d4ff', border: 'rgba(0,212,255,0.32)' },
  standby: { label: 'STANDBY', color: '#8ba9cc', border: 'rgba(139,169,204,0.28)' },
}

function avg(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function OverviewMiniTrendCard({
  title,
  values,
  color,
  unit,
  hourIndex,
}: {
  title: string
  values: number[]
  color: string
  unit: string
  hourIndex: number
}) {
  const [hovered, setHovered] = useState(false)
  const current = values[hourIndex] ?? 0
  const peak = values.length ? Math.max(...values) : 0

  return (
    <div
      className="panel min-h-0 flex flex-col"
      style={{
        padding: 12,
        boxShadow: hovered ? 'inset 0 0 0 1px rgba(0,212,255,0.16), 0 0 18px rgba(0,212,255,0.08)' : undefined,
        transition: 'box-shadow 180ms ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div>
          <div style={{ color: '#e8f4ff', fontSize: 12, fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}>{title}</div>
          <div style={{ color: '#3d6080', fontSize: 10 }}>当前 {hourIndex + 1}h</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color, fontSize: 18, fontFamily: "'Rajdhani', sans-serif", fontWeight: 700 }}>{current.toFixed(unit === 'kg/s' ? 3 : 0)}</div>
          <div style={{ color: '#5a7a9a', fontSize: 10 }}>{unit}</div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <MetricSparkline values={values} stroke={color} highlightIndex={hourIndex} emphasized={hovered} />
      </div>
      <div className="flex items-center justify-between" style={{ marginTop: 8, color: '#5a7a9a', fontSize: 10 }}>
        <span>日均 {avg(values).toFixed(unit === 'kg/s' ? 3 : 0)} {unit}</span>
        <span>峰值 {peak.toFixed(unit === 'kg/s' ? 3 : 0)}</span>
      </div>
    </div>
  )
}

function KpiCard({
  title,
  value,
  unit,
  accent,
  icon: Icon,
}: {
  title: string
  value: string
  unit: string
  accent: string
  icon: typeof Factory
}) {
  return (
    <div className="panel" style={{ padding: 12 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span style={{ color: '#8ba9cc', fontSize: 11 }}>{title}</span>
        <Icon size={14} style={{ color: accent }} />
      </div>
      <div style={{ color: '#e8f4ff', fontFamily: "'Rajdhani', sans-serif", fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: '#3d6080', fontSize: 10, marginTop: 6 }}>{unit}</div>
    </div>
  )
}

function SceneLoadingFallback() {
  return (
    <div className="h-full w-full flex items-center justify-center" style={{ background: 'radial-gradient(circle at center, rgba(0,212,255,0.08), rgba(8,17,31,0.9) 58%)' }}>
      <div className="panel" style={{ padding: '14px 18px', minWidth: 220, textAlign: 'center' }}>
        <div style={{ color: '#e8f4ff', fontFamily: "'Rajdhani', sans-serif", fontSize: 18, letterSpacing: 1 }}>加载 3D 园区场景</div>
        <div style={{ color: '#5a7a9a', fontSize: 11, marginTop: 6 }}>数字孪生主视图已改为动态导入，优先压缩首屏体积。</div>
      </div>
    </div>
  )
}

export default function OverviewPage() {
  const { datasetLoading, datasetError, dataset, activeStrategy, strategyMeta, currentTime } = useStrategy()
  const [activeDeviceId, setActiveDeviceId] = useState(PARK_DEVICES[0].id)
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null)
  const [cameraFocus, setCameraFocus] = useState<{ type: 'device' | 'flow' | 'default'; id: string | null; version: number }>({
    type: 'default',
    id: null,
    version: 0,
  })
  const hourIndex = currentTime.getHours() % 24

  const handleSelectDevice = (id: string) => {
    setActiveDeviceId(id)
    setActiveFlowId(null)
    setCameraFocus((current) => ({ type: 'device', id, version: current.version + 1 }))
  }

  const handleSelectFlow = (id: string) => {
    setActiveFlowId(id)
    setCameraFocus((current) => ({ type: 'flow', id, version: current.version + 1 }))
  }

  const handleResetView = () => {
    setActiveFlowId(null)
    setCameraFocus((current) => ({ type: 'default', id: null, version: current.version + 1 }))
  }

  const activeDetail = useMemo(
    () => buildDeviceDetail(activeDeviceId, dataset, activeStrategy, hourIndex),
    [activeDeviceId, dataset, activeStrategy, hourIndex]
  )

  const deviceDetails = useMemo(
    () => Object.fromEntries(PARK_DEVICES.map((device) => [device.id, buildDeviceDetail(device.id, dataset, activeStrategy, hourIndex)])),
    [dataset, activeStrategy, hourIndex]
  )

  const sceneSnapshot = useMemo(
    () =>
      buildTwinSceneSnapshot({
        dataset,
        activeStrategy,
        hourIndex,
        strategyLabel: strategyMeta[activeStrategy].fullLabel,
        devices: PARK_DEVICES,
        deviceDetails,
      }),
    [dataset, activeStrategy, hourIndex, strategyMeta, deviceDetails]
  )

  const currentSummary = dataset.summary[activeStrategy]
  const currentSupply = (dataset.P_PV[activeStrategy][hourIndex] ?? 0)
    + (dataset.P_GM[activeStrategy][hourIndex] ?? 0)
    + (dataset.P_PEM[activeStrategy][hourIndex] ?? 0)
    + (dataset.P_G[activeStrategy][hourIndex] ?? 0)
  const storageNow = dataset.H_HS[activeStrategy][hourIndex] ?? 0
  const currentGrid = dataset.P_G[activeStrategy][hourIndex] ?? 0
  const activeSeriesColor = activeDetail.metrics.find((metric) => metric.tone)?.tone ?? STATUS_STYLE[activeDetail.status].color

  const trendColors: Record<PrefixKey, string> = {
    ca: '#4e9eff',
    pv: '#c6f135',
    gm: '#ffb347',
    pem: '#29d4ff',
    g: '#ce93d8',
  }

  if (datasetLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        加载数据中...
      </div>
    )
  }

  return (
    <div
      className="h-full min-h-0 overflow-hidden"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 18%) minmax(620px, 1fr) minmax(300px, 26%)',
        gap: 12,
        minHeight: 0,
      }}
    >
      <div
        className="min-h-0"
        style={{
          display: 'grid',
          gridTemplateRows: 'repeat(5, minmax(0, 1fr))',
          gap: 12,
          minHeight: 0,
        }}
      >
        {PREFIX_ORDER.map((prefix) => {
          const metricKey = PREFIX_TO_METRIC[prefix]
          const values = dataset[metricKey][activeStrategy] as number[]

          return (
            <OverviewMiniTrendCard
              key={prefix}
              title={PREFIX_LABELS[prefix]}
              values={values}
              color={trendColors[prefix]}
              unit="kW"
              hourIndex={hourIndex}
            />
          )
        })}
      </div>

      <div
        className="min-h-0"
        style={{
          display: 'grid',
          gridTemplateRows: 'minmax(0, 1fr) 72px',
          gap: 12,
          minHeight: 0,
        }}
      >
        <div className="panel min-h-0 flex flex-col overflow-hidden">
          <div className="panel-title-bar flex items-center justify-between">
            <span>园区数字孪生</span>
            <span style={{ color: '#3d6080', fontSize: 10 }}>
              {strategyMeta[activeStrategy].fullLabel} / {hourIndex + 1}h
              {datasetError ? ' / 本地数据' : ''}
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Suspense fallback={<SceneLoadingFallback />}>
              <Park3DScene
                devices={PARK_DEVICES}
                deviceDetails={deviceDetails}
                snapshot={sceneSnapshot}
                activeDeviceId={activeDeviceId}
                activeFlowId={activeFlowId}
                focusedTargetType={cameraFocus.type}
                focusedTargetId={cameraFocus.id}
                focusVersion={cameraFocus.version}
                onSelectDevice={handleSelectDevice}
                onSelectFlow={handleSelectFlow}
                onResetView={handleResetView}
              />
            </Suspense>
          </div>
        </div>

        <div className="panel flex items-center justify-between" style={{ padding: '0 16px' }}>
          <div>
            <div style={{ color: '#8ba9cc', fontSize: 11 }}>3D 场景交互提示</div>
            <div style={{ color: '#e8f4ff', fontFamily: "'Rajdhani', sans-serif", fontSize: 16, letterSpacing: 1 }}>
              点击关键区域联动镜头、标签卡和右侧实时设备指标
            </div>
          </div>
          <div className="flex items-center gap-4" style={{ color: '#5a7a9a', fontSize: 11 }}>
            <span>数字孪生 + 发光能量流</span>
            <span>路</span>
            <span>程序化建模 + Bloom 后处理</span>
          </div>
        </div>
      </div>

      <div
        className="min-h-0"
        style={{
          display: 'grid',
          gridTemplateRows: 'minmax(0, 0.2fr) minmax(400px, 0.46fr) minmax(260px, 0.34fr)',
          gap: 12,
          minHeight: 0,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <KpiCard title="当前综合指标" value={currentSummary.combined.toFixed(2)} unit={strategyMeta[activeStrategy].label} accent="#00d4ff" icon={Factory} />
          <KpiCard title="当前总供能" value={currentSupply.toFixed(0)} unit="kW" accent="#4e9eff" icon={Gauge} />
          <KpiCard title="当前购电" value={currentGrid.toFixed(0)} unit="kW" accent="#ce93d8" icon={Activity} />
          <KpiCard title="当前储氢" value={storageNow.toFixed(3)} unit="t" accent="#ce93d8" icon={BatteryCharging} />
        </div>

        <div className="panel min-h-0 flex flex-col" style={{ padding: 14, overflow: 'hidden' }}>
          <div className="flex items-start justify-between" style={{ marginBottom: 12 }}>
            <div>
              <div style={{ color: '#e8f4ff', fontFamily: "'Rajdhani', sans-serif", fontSize: 18, fontWeight: 600, letterSpacing: 1 }}>
                {activeDetail.name}
              </div>
              <div style={{ color: '#5a7a9a', fontSize: 11, marginTop: 2 }}>{activeDetail.subtitle}</div>
            </div>
            <span
              style={{
                padding: '5px 10px',
                borderRadius: 999,
                color: STATUS_STYLE[activeDetail.status].color,
                border: `1px solid ${STATUS_STYLE[activeDetail.status].border}`,
                fontSize: 10,
                letterSpacing: 1,
              }}
            >
              {STATUS_STYLE[activeDetail.status].label}
            </span>
          </div>

          <div
            className="flex-1 overflow-y-auto"
            style={{
              minHeight: 0,
              paddingRight: 6,
              scrollbarGutter: 'stable',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
              {activeDetail.metrics.map((metric) => (
                <div key={metric.label} style={{ border: '1px solid #1e3256', borderRadius: 10, padding: '10px 12px', background: 'rgba(17,27,46,0.6)' }}>
                  <div style={{ color: '#5a7a9a', fontSize: 10, marginBottom: 6 }}>{metric.label}</div>
                  <div style={{ color: metric.tone ?? '#e8f4ff', fontFamily: "'Rajdhani', sans-serif", fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{metric.value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 10 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <span style={{ color: '#8ba9cc', fontSize: 11 }}>{activeDetail.primarySeriesLabel}</span>
                <span style={{ color: '#3d6080', fontSize: 10 }}>当前时段 {hourIndex + 1}h</span>
              </div>
              <div style={{ height: 96 }}>
                <MetricSparkline values={activeDetail.series} stroke={activeSeriesColor} highlightIndex={hourIndex} emphasized />
              </div>
            </div>

            <div style={{ borderTop: '1px solid #1e3256', paddingTop: 12 }}>
              <div className="flex items-start gap-2" style={{ color: '#8ba9cc', fontSize: 12, lineHeight: 1.7 }}>
                <Leaf size={14} style={{ color: STATUS_STYLE[activeDetail.status].color, marginTop: 2 }} />
                <span>{activeDetail.statusDescription}</span>
              </div>
              <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
                <span style={{ color: '#3d6080', fontSize: 10 }}>点击设备不会自动跳转，使用按钮进入详情页</span>
                <Link
                  to={activeDetail.route}
                  className="flex items-center gap-1 text-xs hover:text-[#00d4ff] transition-colors"
                  style={{ color: '#8ba9cc' }}
                >
                  查看详情 <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="panel min-h-0 flex flex-col" style={{ padding: 14 }}>
          <div className="panel-title-bar" style={{ marginBottom: 10 }}>设备状态总览</div>
          <div className="flex-1 overflow-auto" style={{ display: 'grid', gap: 8 }}>
            {PARK_DEVICES.map((device) => {
              const detail = deviceDetails[device.id]
              return (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => handleSelectDevice(device.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${STATUS_STYLE[detail.status].border}`,
                    background: device.id === activeDeviceId ? 'rgba(0,212,255,0.08)' : 'rgba(17,27,46,0.55)',
                    color: '#e8f4ff',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12 }}>{device.name}</div>
                    <div style={{ color: '#5a7a9a', fontSize: 10, marginTop: 3 }}>{detail.metrics[0]?.label}: {detail.metrics[0]?.value}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {detail.status === 'warning' && <TriangleAlert size={13} style={{ color: STATUS_STYLE[detail.status].color }} />}
                    <span style={{ color: STATUS_STYLE[detail.status].color, fontSize: 10, letterSpacing: 1 }}>{STATUS_STYLE[detail.status].label}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
