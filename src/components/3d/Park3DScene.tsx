import { Canvas as FiberCanvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls as DreiOrbitControls } from '@react-three/drei'
import { useEffect, useRef, useState, type ComponentType } from 'react'
import { MOUSE, Vector3 } from 'three'
import type { ParkDeviceConfig, ParkDeviceDetail } from './parkDeviceConfig'
import { DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET, TWIN_COLORS } from './digitalTwin/config'
import type { TwinFlow, TwinSceneSnapshot } from './digitalTwin/types'
import GroundPlatform from './digitalTwin/GroundPlatform'
import ParkAssets from './digitalTwin/ParkAssets'
import EnergyFlows from './digitalTwin/EnergyFlows'
import LabelsAndMarkers from './digitalTwin/LabelsAndMarkers'
import SceneLights from './digitalTwin/SceneLights'
import ScenePostFX from './digitalTwin/ScenePostFX'

const Canvas = FiberCanvas as unknown as ComponentType<any>
const OrbitControls = DreiOrbitControls as unknown as ComponentType<any>

interface Park3DSceneProps {
  devices: ParkDeviceConfig[]
  deviceDetails: Record<string, ParkDeviceDetail>
  snapshot: TwinSceneSnapshot
  activeDeviceId: string
  activeFlowId: string | null
  focusedTargetType: 'device' | 'flow' | 'default'
  focusedTargetId: string | null
  focusVersion: number
  onSelectDevice: (id: string) => void
  onSelectFlow: (id: string) => void
  onResetView: () => void
}

function CameraDirector({
  devices,
  flows,
  focusedTargetType,
  focusedTargetId,
  focusVersion,
  controlsRef,
}: {
  devices: ParkDeviceConfig[]
  flows: TwinFlow[]
  focusedTargetType: 'device' | 'flow' | 'default'
  focusedTargetId: string | null
  focusVersion: number
  controlsRef: { current: any }
}) {
  const { camera } = useThree()
  const targetRef = useRef(new Vector3(...DEFAULT_CAMERA_TARGET))
  const startTargetRef = useRef(new Vector3(...DEFAULT_CAMERA_TARGET))
  const endTargetRef = useRef(new Vector3(...DEFAULT_CAMERA_TARGET))
  const startCameraRef = useRef(new Vector3(...DEFAULT_CAMERA_POSITION))
  const endCameraRef = useRef(new Vector3(...DEFAULT_CAMERA_POSITION))
  const animationProgressRef = useRef(1)
  const isAnimatingRef = useRef(false)

  useEffect(() => {
    const activeDevice = focusedTargetType === 'device' ? devices.find((device) => device.id === focusedTargetId) : null
    const activeFlow = focusedTargetType === 'flow' ? flows.find((flow) => flow.id === focusedTargetId) : null
    const currentTarget = controlsRef.current?.target ?? targetRef.current

    startCameraRef.current.copy(camera.position)
    startTargetRef.current.copy(currentTarget)

    if (activeFlow) {
      endTargetRef.current.set(...activeFlow.focusTarget)
      endCameraRef.current.set(...activeFlow.focusCamera)
    } else if (activeDevice) {
      endTargetRef.current.set(...activeDevice.focusTarget)
      endCameraRef.current.set(...activeDevice.focusCamera)
    } else {
      endTargetRef.current.set(...DEFAULT_CAMERA_TARGET)
      endCameraRef.current.set(...DEFAULT_CAMERA_POSITION)
    }

    animationProgressRef.current = 0
    isAnimatingRef.current = true
  }, [camera.position, controlsRef, devices, flows, focusedTargetId, focusedTargetType, focusVersion])

  useFrame(() => {
    if (!isAnimatingRef.current) {
      return
    }

    animationProgressRef.current = Math.min(animationProgressRef.current + 0.04, 1)
    const t = animationProgressRef.current
    const eased = 1 - (1 - t) * (1 - t) * (1 - t)

    camera.position.lerpVectors(startCameraRef.current, endCameraRef.current, eased)
    targetRef.current.lerpVectors(startTargetRef.current, endTargetRef.current, eased)

    if (controlsRef.current?.target) {
      controlsRef.current.target.copy(targetRef.current)
      controlsRef.current.update()
    } else {
      camera.lookAt(targetRef.current)
    }

    if (t >= 1) {
      isAnimatingRef.current = false
    }
  })

  return null
}

function SceneContent({
  devices,
  deviceDetails,
  snapshot,
  activeDeviceId,
  activeFlowId,
  focusedTargetType,
  focusedTargetId,
  focusVersion,
  onSelectDevice,
  onSelectFlow,
}: Park3DSceneProps) {
  const controlsRef = useRef<any>(null)

  return (
    <>
      <SceneLights />
      <CameraDirector
        devices={devices}
        flows={snapshot.flows}
        focusedTargetType={focusedTargetType}
        focusedTargetId={focusedTargetId}
        focusVersion={focusVersion}
        controlsRef={controlsRef}
      />
      <GroundPlatform />
      <ParkAssets devices={devices} deviceDetails={deviceDetails} activeDeviceId={activeDeviceId} onSelectDevice={onSelectDevice} />
      <EnergyFlows flows={snapshot.flows} activeFlowId={activeFlowId} onSelectFlow={onSelectFlow} />
      <LabelsAndMarkers snapshot={snapshot} activeDeviceId={activeDeviceId} />
      <ScenePostFX />

      <OrbitControls
        ref={controlsRef}
        enablePan
        panSpeed={0.72}
        screenSpacePanning
        enableDamping
        dampingFactor={0.08}
        autoRotate={!focusedTargetId}
        autoRotateSpeed={0.2}
        minDistance={24}
        maxDistance={60}
        minPolarAngle={Math.PI / 4.6}
        maxPolarAngle={Math.PI / 2.12}
        mouseButtons={{
          LEFT: MOUSE.ROTATE,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.PAN,
        }}
        target={DEFAULT_CAMERA_TARGET}
      />
    </>
  )
}

function OverlayMeter({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: string
}) {
  return (
    <div
      style={{
        minWidth: 112,
        padding: '8px 10px',
        borderRadius: 12,
        border: '1px solid rgba(24,61,86,0.95)',
        background: 'rgba(5,14,24,0.7)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div style={{ color: '#7ea6c7', fontSize: 9, marginBottom: 4 }}>{label}</div>
      <div style={{ color: accent, fontFamily: "'Rajdhani', sans-serif", fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>{value}</div>
    </div>
  )
}

function RatioBar({
  label,
  ratio,
  accent,
}: {
  label: string
  ratio: number
  accent: string
}) {
  return (
    <div style={{ minWidth: 160 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7ea6c7', fontSize: 10, marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color: accent }}>{Math.round(ratio * 100)}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'rgba(14,32,48,0.9)', overflow: 'hidden', border: '1px solid rgba(23,59,83,0.95)' }}>
        <div
          style={{
            width: `${Math.round(ratio * 100)}%`,
            height: '100%',
            borderRadius: 999,
            background: `linear-gradient(90deg, ${accent}88 0%, ${accent} 100%)`,
            boxShadow: `0 0 14px ${accent}55`,
          }}
        />
      </div>
    </div>
  )
}

const FLOW_LEGEND_LABELS: Record<string, string> = {
  'pv-hub': '光伏绿电流',
  'gm-hub': '燃机供电流',
  'grid-hub': '电网购电流',
  'hub-ca': '主供电流',
  'hub-pem': 'PEM 配电流',
  'ca-hs': '制氢入罐流',
  'hs-pem': '储氢供氢流',
  'hub-es': '储能充放电流',
}

function FlowLegend({
  flows,
}: {
  flows: TwinFlow[]
}) {
  const [collapsed, setCollapsed] = useState(false)
  const legendItems = flows.map((flow) => ({
    id: flow.id,
    label: FLOW_LEGEND_LABELS[flow.id] || flow.title,
    color: flow.color,
  }))

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="展开粒子流图例"
        title="展开图例"
        style={{
          position: 'absolute',
          top: 104,
          right: 20,
          width: 30,
          height: 30,
          border: '1px solid rgba(21,61,87,0.95)',
          borderRadius: 10,
          background: 'rgba(4,12,22,0.88)',
          backdropFilter: 'blur(10px)',
          color: '#d9fdff',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 16,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 0 16px rgba(0,215,255,0.08)',
          pointerEvents: 'auto',
        }}
      >
        {'<'}
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 104,
        right: 20,
        width: 214,
        padding: '12px 14px',
        borderRadius: 14,
        border: '1px solid rgba(21,61,87,0.95)',
        background: 'rgba(4,12,22,0.76)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 0 18px rgba(0,215,255,0.06)',
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        aria-label="收起粒子流图例"
        title="收起图例"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 24,
          height: 24,
          border: '1px solid rgba(21,61,87,0.95)',
          borderRadius: 8,
          background: 'rgba(4,12,22,0.88)',
          color: '#d9fdff',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
          boxShadow: '0 0 16px rgba(0,215,255,0.08)',
        }}
      >
        {'>'}
      </button>
      <div style={{ color: '#d9fdff', fontFamily: "'Rajdhani', sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>
        粒子流图例
      </div>
      <div style={{ color: '#7ea6c7', fontSize: 10, marginTop: 3, marginBottom: 10 }}>
        颜色对应的粒子管道流类型
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {legendItems.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '52px minmax(0, 1fr)',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                position: 'relative',
                height: 10,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: 3,
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${item.color}66 0%, ${item.color} 100%)`,
                  boxShadow: `0 0 14px ${item.color}55`,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  right: -1,
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: '#ffffff',
                  border: `2px solid ${item.color}`,
                  boxShadow: `0 0 10px ${item.color}`,
                }}
              />
            </div>
            <div style={{ color: '#cfe8f4', fontSize: 11, lineHeight: 1.35 }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SceneOverlay({
  snapshot,
  activeDetail,
}: {
  snapshot: TwinSceneSnapshot
  activeDetail: ParkDeviceDetail
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        style={{
          position: 'absolute',
          inset: 10,
          border: '1px solid rgba(16,52,76,0.72)',
          boxShadow: 'inset 0 0 0 1px rgba(0,215,255,0.04), inset 0 0 42px rgba(0,215,255,0.03)',
        }}
      />

      {[
        { top: 10, left: 10 },
        { top: 10, right: 10 },
        { bottom: 10, left: 10 },
        { bottom: 10, right: 10 },
      ].map((corner, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            width: 38,
            height: 38,
            borderTop: corner.top != null ? '2px solid rgba(0,215,255,0.55)' : undefined,
            borderLeft: corner.left != null ? '2px solid rgba(0,215,255,0.55)' : undefined,
            borderRight: corner.right != null ? '2px solid rgba(0,215,255,0.55)' : undefined,
            borderBottom: corner.bottom != null ? '2px solid rgba(0,215,255,0.55)' : undefined,
            ...corner,
          }}
        />
      ))}

      <div style={{ position: 'absolute', top: 18, left: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: 999, background: TWIN_COLORS.primary, boxShadow: `0 0 14px ${TWIN_COLORS.primary}` }} />
        <div>
          <div style={{ color: '#d9fdff', fontFamily: "'Rajdhani', sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: 1.2 }}>园区数字孪生</div>
          <div style={{ color: '#7ea6c7', fontSize: 10 }}>{snapshot.strategyLabel} / {snapshot.hourLabel}</div>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 18, right: 20, display: 'flex', gap: 10 }}>
        {snapshot.hudMetrics.slice(0, 3).map((metric) => (
          <OverlayMeter key={metric.id} label={metric.label} value={metric.value} accent={metric.accent} />
        ))}
      </div>

      <FlowLegend flows={snapshot.flows} />

      <div
        style={{
          position: 'absolute',
          left: 20,
          bottom: 22,
          width: 240,
          padding: '12px 14px',
          borderRadius: 14,
          border: '1px solid rgba(21,61,87,0.95)',
          background: 'rgba(4,12,22,0.76)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 0 18px rgba(0,215,255,0.06)',
        }}
      >
        <div style={{ color: '#7ea6c7', fontSize: 10, marginBottom: 6 }}>ACTIVE ZONE</div>
        <div style={{ color: '#d9fdff', fontFamily: "'Rajdhani', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>{activeDetail.name}</div>
        <div style={{ color: '#7ea6c7', fontSize: 11, marginTop: 4 }}>{activeDetail.subtitle}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          {activeDetail.metrics.slice(0, 2).map((metric) => (
            <div key={metric.label} style={{ borderRadius: 10, border: '1px solid rgba(19,50,73,0.95)', background: 'rgba(11,23,37,0.82)', padding: '8px 10px' }}>
              <div style={{ color: '#7ea6c7', fontSize: 9 }}>{metric.label}</div>
              <div style={{ color: metric.tone ?? '#d9fdff', fontFamily: "'Rajdhani', sans-serif", fontSize: 14, fontWeight: 700, marginTop: 3 }}>{metric.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: '58%',
          bottom: 22,
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 18,
          padding: '12px 16px',
          borderRadius: 16,
          border: '1px solid rgba(18,55,79,0.95)',
          background: 'rgba(4,12,20,0.72)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <RatioBar label="绿电占比" ratio={snapshot.renewableShare} accent={TWIN_COLORS.energy} />
        <RatioBar label="储能活跃度" ratio={snapshot.storageActivity} accent={TWIN_COLORS.storage} />
        <RatioBar label="电网依赖" ratio={snapshot.gridDependence} accent="#ce93d8" />
      </div>
    </div>
  )
}

export default function Park3DScene(props: Park3DSceneProps) {
  const activeDetail = props.deviceDetails[props.activeDeviceId]

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at 50% 32%, rgba(0,215,255,0.12), rgba(6,16,24,0.96) 52%), linear-gradient(180deg, #061018 0%, #040a14 100%)',
      }}
    >
      <Canvas
        camera={{ position: DEFAULT_CAMERA_POSITION, fov: 36 }}
        onPointerMissed={props.onResetView}
        style={{ width: '100%', height: '100%' }}
      >
        <SceneContent {...props} />
      </Canvas>
      <SceneOverlay snapshot={props.snapshot} activeDetail={activeDetail} />
    </div>
  )
}
