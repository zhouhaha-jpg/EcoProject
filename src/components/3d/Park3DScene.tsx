import { Canvas as FiberCanvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls as DreiOrbitControls } from '@react-three/drei'
import { useEffect, useRef, type ComponentType } from 'react'
import { Vector3 } from 'three'
import type { ParkDeviceConfig, ParkDeviceDetail } from './parkDeviceConfig'
import { DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET, TWIN_COLORS } from './digitalTwin/config'
import type { TwinSceneSnapshot } from './digitalTwin/types'
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
  focusedDeviceId: string | null
  focusVersion: number
  onSelectDevice: (id: string) => void
  onResetView: () => void
}

function CameraDirector({
  devices,
  focusedDeviceId,
  focusVersion,
  controlsRef,
}: {
  devices: ParkDeviceConfig[]
  focusedDeviceId: string | null
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
    const activeDevice = devices.find((device) => device.id === focusedDeviceId)
    const currentTarget = controlsRef.current?.target ?? targetRef.current

    startCameraRef.current.copy(camera.position)
    startTargetRef.current.copy(currentTarget)

    if (!activeDevice) {
      endTargetRef.current.set(...DEFAULT_CAMERA_TARGET)
      endCameraRef.current.set(...DEFAULT_CAMERA_POSITION)
    } else {
      endTargetRef.current.set(...activeDevice.focusTarget)
      endCameraRef.current.set(...activeDevice.focusCamera)
    }

    animationProgressRef.current = 0
    isAnimatingRef.current = true
  }, [camera.position, controlsRef, devices, focusedDeviceId, focusVersion])

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
  focusedDeviceId,
  focusVersion,
  onSelectDevice,
}: Park3DSceneProps) {
  const controlsRef = useRef<any>(null)

  return (
    <>
      <SceneLights />
      <CameraDirector devices={devices} focusedDeviceId={focusedDeviceId} focusVersion={focusVersion} controlsRef={controlsRef} />
      <GroundPlatform />
      <ParkAssets devices={devices} deviceDetails={deviceDetails} activeDeviceId={activeDeviceId} onSelectDevice={onSelectDevice} />
      <EnergyFlows flows={snapshot.flows} />
      <LabelsAndMarkers snapshot={snapshot} activeDeviceId={activeDeviceId} />
      <ScenePostFX />

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        autoRotate={!focusedDeviceId}
        autoRotateSpeed={0.2}
        minDistance={24}
        maxDistance={60}
        minPolarAngle={Math.PI / 4.6}
        maxPolarAngle={Math.PI / 2.12}
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
          <div style={{ color: '#d9fdff', fontFamily: "'Rajdhani', sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: 1.2 }}>DIGITAL TWIN CAMPUS</div>
          <div style={{ color: '#7ea6c7', fontSize: 10 }}>{snapshot.strategyLabel} / {snapshot.hourLabel}</div>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 18, right: 20, display: 'flex', gap: 10 }}>
        {snapshot.hudMetrics.slice(0, 3).map((metric) => (
          <OverlayMeter key={metric.id} label={metric.label} value={metric.value} accent={metric.accent} />
        ))}
      </div>

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
          left: '50%',
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
