import { Canvas as FiberCanvas, useFrame, useThree } from '@react-three/fiber'
import { Edges as DreiEdges, Grid as DreiGrid, Html as DreiHtml, OrbitControls as DreiOrbitControls, useCursor } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { CatmullRomCurve3, Color, Group, MeshStandardMaterial, TubeGeometry, Vector3 } from 'three'
import type { ParkDeviceConfig, ParkDeviceStatus } from './parkDeviceConfig'

const Canvas = FiberCanvas as unknown as ComponentType<any>
const Html = DreiHtml as unknown as ComponentType<any>
const Edges = DreiEdges as unknown as ComponentType<any>
const Grid = DreiGrid as unknown as ComponentType<any>
const OrbitControls = DreiOrbitControls as unknown as ComponentType<any>

const DEFAULT_CAMERA_POSITION: [number, number, number] = [33, 24, 32]
const DEFAULT_CAMERA_TARGET: [number, number, number] = [2, 1.8, 3]

interface Park3DSceneProps {
  devices: ParkDeviceConfig[]
  statuses: Record<string, ParkDeviceStatus>
  activeDeviceId: string
  focusedDeviceId: string | null
  focusVersion: number
  onSelectDevice: (id: string) => void
  onResetView: () => void
}

function statusColor(status: ParkDeviceStatus, fallback: string) {
  switch (status) {
    case 'warning':
      return '#ff7043'
    case 'focus':
      return '#00d4ff'
    case 'standby':
      return '#5a7a9a'
    default:
      return fallback
  }
}

function FlowTube({ points, color, speed = 0.14, pulse = 0 }: { points: [number, number, number][]; color: string; speed?: number; pulse?: number }) {
  const tubeRef = useRef<any>(null)
  const particleRef = useRef<any>(null)
  const curve = useMemo(() => new CatmullRomCurve3(points.map((point) => new Vector3(...point))), [points])
  const geometry = useMemo(() => new TubeGeometry(curve, 80, 0.1, 8, false), [curve])

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime()
    const progress = (elapsed * speed + pulse) % 1
    const point = curve.getPointAt(progress)

    if (tubeRef.current) {
      tubeRef.current.material.opacity = 0.18 + Math.sin(elapsed * 2.2 + pulse * Math.PI) * 0.04
    }

    if (particleRef.current) {
      particleRef.current.position.copy(point)
      particleRef.current.material.emissiveIntensity = 0.9 + Math.sin(elapsed * 8 + pulse * 3) * 0.25
    }
  })

  return (
    <group>
      <mesh geometry={geometry} ref={tubeRef}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} transparent opacity={0.18} roughness={0.24} metalness={0.3} />
      </mesh>
      <mesh ref={particleRef}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color="#dff7ff" emissive={color} emissiveIntensity={1.05} />
      </mesh>
    </group>
  )
}

function EnergyFlowLayer({ activeDeviceId }: { activeDeviceId: string }) {
  const flows = useMemo(() => {
    const activeAccent = '#00d4ff'
    const standbyAccent = '#2d567f'
    const storageActive = activeDeviceId === 'hs-tank' || activeDeviceId === 'es-bank'

    return [
      {
        id: 'pv-ca',
        color: activeDeviceId === 'pv-field' || activeDeviceId === 'ca-main' ? activeAccent : standbyAccent,
        points: [[-17, 1.1, -3], [-11, 2.3, -1], [-6, 2.1, 1], [0, 1.9, 2]] as [number, number, number][],
      },
      {
        id: 'ca-hs',
        color: activeDeviceId === 'ca-main' || activeDeviceId === 'hs-tank' || storageActive ? '#ce93d8' : standbyAccent,
        points: [[0, 2.2, 2], [3, 3.1, 4], [7, 3.3, 6], [11, 2.8, 8]] as [number, number, number][],
      },
      {
        id: 'gm-grid',
        color: activeDeviceId === 'gm-unit' ? '#ffb347' : standbyAccent,
        points: [[15, 2.1, -6], [18, 2.8, -3], [20, 2.4, 1], [19, 1.8, 7]] as [number, number, number][],
      },
      {
        id: 'hs-pem',
        color: activeDeviceId === 'pem-unit' || activeDeviceId === 'hs-tank' ? '#29d4ff' : standbyAccent,
        points: [[11, 2.8, 8], [5, 3.8, 9], [-2, 3.2, 10], [-11, 1.8, 8]] as [number, number, number][],
      },
    ]
  }, [activeDeviceId])

  return (
    <group>
      {flows.map((flow, index) => (
        <FlowTube key={flow.id} points={flow.points} color={flow.color} speed={0.1 + index * 0.025} pulse={index * 0.18} />
      ))}
    </group>
  )
}

function CameraDirector({ devices, focusedDeviceId, focusVersion, controlsRef }: { devices: ParkDeviceConfig[]; focusedDeviceId: string | null; focusVersion: number; controlsRef: { current: any } }) {
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

    animationProgressRef.current = Math.min(animationProgressRef.current + 0.045, 1)
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

function DevicePrimitive({ device, status, isActive, onSelect }: { device: ParkDeviceConfig; status: ParkDeviceStatus; isActive: boolean; onSelect: (id: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const rootRef = useRef<Group>(null)
  useCursor(hovered)

  const accent = statusColor(status, device.color)
  const shellColor = isActive ? '#173457' : '#10233f'
  const emissiveIntensity = isActive ? 0.9 : hovered ? 0.55 : status === 'focus' ? 0.48 : status === 'warning' ? 0.26 : 0.16
  const hoverLift = hovered ? 0.35 : isActive ? 0.18 : 0

  useFrame(({ clock }) => {
    if (!rootRef.current) return

    const elapsed = clock.getElapsedTime()
    const pulse = isActive ? Math.sin(elapsed * 3.2) * 0.06 : hovered ? Math.sin(elapsed * 4.4) * 0.04 : 0
    rootRef.current.position.y += ((device.position[1] + hoverLift + pulse) - rootRef.current.position.y) * 0.14

    const scaleTarget = isActive ? 1.05 : hovered ? 1.03 : 1
    rootRef.current.scale.x += (scaleTarget - rootRef.current.scale.x) * 0.12
    rootRef.current.scale.y += (scaleTarget - rootRef.current.scale.y) * 0.12
    rootRef.current.scale.z += (scaleTarget - rootRef.current.scale.z) * 0.12

    rootRef.current.traverse((child) => {
      const material = (child as any).material
      if (!material || !(material instanceof MeshStandardMaterial)) return
      material.emissive = new Color(accent)
      const targetIntensity = isActive ? 0.95 : hovered ? 0.65 : status === 'focus' ? 0.48 : status === 'warning' ? 0.28 : 0.16
      material.emissiveIntensity += (targetIntensity - material.emissiveIntensity) * 0.12
    })
  })

  const commonEvents = {
    onPointerOver: () => setHovered(true),
    onPointerOut: () => setHovered(false),
    onClick: (event: { stopPropagation: () => void }) => {
      event.stopPropagation()
      onSelect(device.id)
    },
  }

  const label = isActive ? (
    <Html position={[0, device.size[1] + 1.2, 0]} center distanceFactor={15}>
      <div
        style={{
          padding: '6px 10px',
          border: '1px solid rgba(0,212,255,0.35)',
          background: 'rgba(13,20,34,0.88)',
          color: '#e8f4ff',
          borderRadius: 8,
          fontSize: 11,
          fontFamily: "'Rajdhani', sans-serif",
          letterSpacing: 1,
          boxShadow: '0 0 18px rgba(0,212,255,0.12)',
          whiteSpace: 'nowrap',
        }}
      >
        {device.name}
      </div>
    </Html>
  ) : null

  const materialProps = {
    color: shellColor,
    emissive: accent,
    emissiveIntensity,
    roughness: 0.38,
    metalness: 0.62,
    transparent: true,
    opacity: isActive ? 0.98 : 0.9,
  }

  switch (device.type) {
    case 'ca':
      return (
        <group position={device.position} ref={rootRef}>
          {[-4.2, -1.4, 1.4, 4.2].map((offset) => (
            <mesh key={offset} position={[offset, 0, 0]} {...commonEvents}>
              <boxGeometry args={[2.2, 2.2, 5.4]} />
              <meshStandardMaterial {...materialProps} />
              <Edges color={accent} />
            </mesh>
          ))}
          <mesh position={[0, 1.7, 0]} {...commonEvents}>
            <boxGeometry args={[10.5, 0.35, 0.45]} />
            <meshStandardMaterial color="#20486f" emissive={accent} emissiveIntensity={0.35} />
          </mesh>
          {label}
        </group>
      )
    case 'pem':
      return (
        <group position={device.position} ref={rootRef}>
          {[-1.8, 0, 1.8].map((offset) => (
            <mesh key={offset} position={[offset, 0, 0]} {...commonEvents}>
              <cylinderGeometry args={[0.9, 0.9, 2.2, 16]} />
              <meshStandardMaterial {...materialProps} />
              <Edges color={accent} />
            </mesh>
          ))}
          <mesh position={[0, -1.1, 0]} {...commonEvents}>
            <boxGeometry args={[5.4, 0.3, 2.4]} />
            <meshStandardMaterial color="#16385d" emissive={accent} emissiveIntensity={0.25} />
          </mesh>
          {label}
        </group>
      )
    case 'pv':
      return (
        <group position={device.position} ref={rootRef}>
          {[-4, 0, 4].flatMap((row) => [-3, 0, 3].map((col) => (
            <mesh key={`${row}-${col}`} position={[row, 0, col]} rotation={[-0.45, 0.18, 0]} {...commonEvents}>
              <boxGeometry args={[2.5, 0.15, 1.55]} />
              <meshStandardMaterial color="#10223c" emissive={accent} emissiveIntensity={isActive ? 0.72 : hovered ? 0.45 : 0.22} />
              <Edges color="#95dfff" />
            </mesh>
          )))}
          {label}
        </group>
      )
    case 'gm':
      return (
        <group position={device.position} ref={rootRef}>
          <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]} {...commonEvents}>
            <cylinderGeometry args={[1.25, 1.25, 4.4, 18]} />
            <meshStandardMaterial {...materialProps} />
            <Edges color={accent} />
          </mesh>
          <mesh position={[2.1, 1.3, -0.6]} {...commonEvents}>
            <cylinderGeometry args={[0.42, 0.52, 2.6, 12]} />
            <meshStandardMaterial color="#15314f" emissive={accent} emissiveIntensity={0.3} />
            <Edges color="#f0c47a" />
          </mesh>
          <mesh position={[0, -1.15, 0]} {...commonEvents}>
            <boxGeometry args={[5.2, 0.35, 2.8]} />
            <meshStandardMaterial color="#152e4b" emissive={accent} emissiveIntensity={0.2} />
          </mesh>
          {label}
        </group>
      )
    case 'hs':
      return (
        <group position={device.position} ref={rootRef}>
          {[-1.4, 1.4].map((offset) => (
            <group key={offset} position={[offset, 0, 0]}>
              <mesh {...commonEvents}>
                <cylinderGeometry args={[1.1, 1.1, 3.8, 20]} />
                <meshStandardMaterial {...materialProps} />
                <Edges color={accent} />
              </mesh>
              <mesh position={[0, 0, 1.12]} {...commonEvents}>
                <boxGeometry args={[0.18, 2.8, 0.12]} />
                <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.78} />
              </mesh>
            </group>
          ))}
          {label}
        </group>
      )
    case 'es':
    default:
      return (
        <group position={device.position} ref={rootRef}>
          {[-2.4, -0.8, 0.8, 2.4].map((offset) => (
            <group key={offset} position={[offset, 0, 0]}>
              <mesh {...commonEvents}>
                <boxGeometry args={[1.15, 1.85, 1.4]} />
                <meshStandardMaterial {...materialProps} />
                <Edges color={accent} />
              </mesh>
              <mesh position={[0, 0.9, 0.71]} {...commonEvents}>
                <boxGeometry args={[0.8, 0.12, 0.08]} />
                <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.9} />
              </mesh>
            </group>
          ))}
          {label}
        </group>
      )
  }
}

function SceneContent({ devices, statuses, activeDeviceId, focusedDeviceId, focusVersion, onSelectDevice }: Park3DSceneProps) {
  const controlsRef = useRef<any>(null)
  const legendItems = useMemo(() => devices.map((device) => ({
    id: device.id,
    name: device.name,
    accent: statusColor(statuses[device.id] ?? 'normal', device.color),
  })), [devices, statuses])

  return (
    <>
      <color attach="background" args={['#08111f']} />
      <fog attach="fog" args={['#08111f', 24, 58]} />
      <ambientLight intensity={0.62} />
      <directionalLight position={[18, 20, 12]} intensity={1.4} color="#a7e8ff" />
      <directionalLight position={[-10, 14, -6]} intensity={0.42} color="#5da7ff" />
      <pointLight position={[0, 10, 0]} intensity={0.7} color="#00d4ff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]}>
        <planeGeometry args={[54, 36]} />
        <meshStandardMaterial color="#0a182a" roughness={0.96} metalness={0.08} />
      </mesh>

      <EnergyFlowLayer activeDeviceId={activeDeviceId} />
      <CameraDirector devices={devices} focusedDeviceId={focusedDeviceId} focusVersion={focusVersion} controlsRef={controlsRef} />

      <Grid
        position={[0, 0.01, 0]}
        args={[48, 32]}
        sectionColor="#20486f"
        cellColor="#12324f"
        cellThickness={0.45}
        sectionThickness={0.9}
        cellSize={2}
        sectionSize={8}
        infiniteGrid={false}
        fadeDistance={55}
        fadeStrength={1}
      />

      {devices.map((device) => (
        <DevicePrimitive
          key={device.id}
          device={device}
          status={statuses[device.id] ?? 'normal'}
          isActive={device.id === activeDeviceId}
          onSelect={onSelectDevice}
        />
      ))}

      <Html position={[0, 8.8, -12]} center distanceFactor={11}>
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '8px 14px',
            borderRadius: 999,
            border: '1px solid rgba(30,50,86,0.88)',
            background: 'rgba(13,20,34,0.86)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 0 18px rgba(0,212,255,0.08)',
          }}
        >
          {legendItems.map((item) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8ba9cc', fontSize: 10, whiteSpace: 'nowrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: item.accent, boxShadow: `0 0 8px ${item.accent}` }} />
              {item.name}
            </div>
          ))}
        </div>
      </Html>

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={20}
        maxDistance={56}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 2.15}
        target={DEFAULT_CAMERA_TARGET}
      />
    </>
  )
}

export default function Park3DScene(props: Park3DSceneProps) {
  return (
    <Canvas
      camera={{ position: DEFAULT_CAMERA_POSITION, fov: 34 }}
      onPointerMissed={props.onResetView}
      style={{ width: '100%', height: '100%' }}
    >
      <SceneContent {...props} />
    </Canvas>
  )
}