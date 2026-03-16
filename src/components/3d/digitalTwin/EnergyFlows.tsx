import { Html, useCursor } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { CatmullRomCurve3, Group, MeshStandardMaterial, Object3D, TubeGeometry, Vector3 } from 'three'
import type { TwinFlow } from './types'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getFlowStyle(flow: TwinFlow, active: boolean, hovered: boolean) {
  const emphasis = active ? 1 : hovered ? 0.65 : 0
  const baseRadius = flow.medium === 'hydrogen' ? 0.12 : flow.medium === 'grid' ? 0.115 : 0.1

  return {
    shellRadius: baseRadius + emphasis * 0.025,
    coreRadius: baseRadius * 0.45 + emphasis * 0.01,
    hitRadius: baseRadius + 0.22,
    shellOpacity: (flow.status === 'warning' ? 0.3 : 0.2) + emphasis * 0.08,
    shellEmissive: 0.38 + emphasis * 0.26,
    coreEmissive: 0.84 + emphasis * 0.28,
    ringEmissive: 0.52 + emphasis * 0.32,
  }
}

function FlowPopup({ flow }: { flow: TwinFlow }) {
  return (
    <Html position={flow.popupPosition} center distanceFactor={11} occlude={false}>
      <div
        style={{
          width: 228,
          padding: '10px 12px',
          borderRadius: 12,
          border: `1px solid ${flow.status === 'warning' ? 'rgba(255,159,67,0.56)' : 'rgba(0,215,255,0.38)'}`,
          background: 'rgba(7,15,26,0.9)',
          boxShadow: `0 0 28px ${flow.color}22`,
          color: '#d9fdff',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: flow.color, boxShadow: `0 0 12px ${flow.color}` }} />
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>{flow.title}</span>
          </div>
          <span style={{ color: flow.color, fontFamily: "'Rajdhani', sans-serif", fontSize: 13, fontWeight: 700 }}>{flow.valueLabel}</span>
        </div>
        <div style={{ color: '#7ea6c7', fontSize: 10, marginBottom: 6 }}>{flow.subtitle}</div>
        <div style={{ color: '#c6dbee', fontSize: 11, lineHeight: 1.55 }}>{flow.description}</div>
      </div>
    </Html>
  )
}

function FlowChannel({
  flow,
  pulseOffset,
  active,
  onSelect,
}: {
  flow: TwinFlow
  pulseOffset: number
  active: boolean
  onSelect: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const shellMaterialRef = useRef<MeshStandardMaterial>(null)
  const coreMaterialRef = useRef<MeshStandardMaterial>(null)
  const particlesRef = useRef<any>(null)
  const orbRef = useRef<Group>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const curve = useMemo(() => new CatmullRomCurve3(flow.points.map((point) => new Vector3(...point)), false, 'centripetal'), [flow.points])
  const style = getFlowStyle(flow, active, hovered)
  const shellGeometry = useMemo(() => new TubeGeometry(curve, 140, style.shellRadius, 18, false), [curve, style.shellRadius])
  const coreGeometry = useMemo(() => new TubeGeometry(curve, 140, style.coreRadius, 14, false), [curve, style.coreRadius])
  const hitGeometry = useMemo(() => new TubeGeometry(curve, 120, style.hitRadius, 12, false), [curve, style.hitRadius])
  const ringOffsets = useMemo(() => [0.12, 0.28, 0.44, 0.6, 0.76, 0.9], [])
  const count = useMemo(() => clamp(Math.round(Math.abs(flow.value) / (flow.medium === 'hydrogen' ? 1100 : 650)) + 6, 7, 26), [flow.medium, flow.value])
  const speed = useMemo(() => clamp(Math.abs(flow.value) / (flow.medium === 'hydrogen' ? 12000 : 9000), 0.16, 0.72), [flow.medium, flow.value])
  useCursor(hovered)

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime()
    const pulse = (Math.sin(elapsed * 2 + pulseOffset * 6) + 1) / 2

    if (shellMaterialRef.current) {
      shellMaterialRef.current.opacity = style.shellOpacity + pulse * 0.05
      shellMaterialRef.current.emissiveIntensity = style.shellEmissive + pulse * 0.08
    }

    if (coreMaterialRef.current) {
      coreMaterialRef.current.opacity = 0.42 + pulse * 0.16 + (active ? 0.1 : 0)
      coreMaterialRef.current.emissiveIntensity = style.coreEmissive + pulse * 0.18
    }

    if (particlesRef.current) {
      for (let index = 0; index < count; index += 1) {
        const offset = (index / count + pulseOffset) % 1
        const rawProgress = (elapsed * speed + offset) % 1
        const progress = flow.direction === 1 ? rawProgress : 1 - rawProgress
        const position = curve.getPointAt(progress)
        const tangent = curve.getTangentAt(progress)

        dummy.position.copy(position)
        dummy.lookAt(position.clone().add(tangent))
        const scale = style.coreRadius * 1.55 + ((index % 3) * 0.02) + (active ? 0.04 : 0)
        dummy.scale.setScalar(scale)
        dummy.updateMatrix()
        particlesRef.current.setMatrixAt(index, dummy.matrix)
      }

      particlesRef.current.instanceMatrix.needsUpdate = true
    }

    if (orbRef.current) {
      const rawProgress = (elapsed * speed * 0.9 + 0.12) % 1
      const progress = flow.direction === 1 ? rawProgress : 1 - rawProgress
      const position = curve.getPointAt(progress)
      orbRef.current.position.copy(position)
      orbRef.current.scale.setScalar(active ? 1.2 : 1)

      const material = (orbRef.current.children[0] as any)?.material as MeshStandardMaterial | undefined
      if (material) {
        material.emissiveIntensity = 1.1 + pulse * 0.3 + (active ? 0.18 : 0)
      }
    }
  })

  return (
    <group>
      <mesh geometry={shellGeometry}>
        <meshStandardMaterial
          ref={shellMaterialRef}
          color={flow.color}
          emissive={flow.color}
          emissiveIntensity={style.shellEmissive}
          transparent
          opacity={style.shellOpacity}
          roughness={0.2}
          metalness={0.52}
        />
      </mesh>

      <mesh geometry={coreGeometry}>
        <meshStandardMaterial
          ref={coreMaterialRef}
          color="#dffbff"
          emissive={flow.color}
          emissiveIntensity={style.coreEmissive}
          transparent
          opacity={0.48}
          roughness={0.12}
          metalness={0.28}
          toneMapped={false}
        />
      </mesh>

      {ringOffsets.map((offset) => {
        const point = curve.getPointAt(offset)
        const tangent = curve.getTangentAt(offset)
        return (
          <group
            key={offset}
            position={point}
            quaternion={new Object3D().quaternion.setFromUnitVectors(new Vector3(0, 1, 0), tangent.clone().normalize())}
          >
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[style.shellRadius + 0.025, 0.012, 8, 18]} />
              <meshStandardMaterial
                color={flow.color}
                emissive={flow.color}
                emissiveIntensity={style.ringEmissive}
                transparent
                opacity={active ? 0.8 : hovered ? 0.72 : 0.64}
                toneMapped={false}
              />
            </mesh>
          </group>
        )
      })}

      <mesh
        geometry={hitGeometry}
        onClick={(event) => {
          event.stopPropagation()
          onSelect(flow.id)
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={(event) => {
          event.stopPropagation()
          setHovered(false)
        }}
      >
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
      </mesh>

      <instancedMesh ref={particlesRef} args={[undefined, undefined, count]}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshStandardMaterial color="#ffffff" emissive={flow.color} emissiveIntensity={1.2} toneMapped={false} />
      </instancedMesh>

      <group ref={orbRef}>
        <mesh>
          <sphereGeometry args={[style.coreRadius * 2.1, 16, 16]} />
          <meshStandardMaterial color="#ffffff" emissive={flow.color} emissiveIntensity={1.1} toneMapped={false} />
        </mesh>
      </group>

      {active ? <FlowPopup flow={flow} /> : null}
    </group>
  )
}

export default function EnergyFlows({
  flows,
  activeFlowId,
  onSelectFlow,
}: {
  flows: TwinFlow[]
  activeFlowId: string | null
  onSelectFlow: (id: string) => void
}) {
  return (
    <group>
      {flows.map((flow, index) => (
        <FlowChannel
          key={flow.id}
          flow={flow}
          pulseOffset={index * 0.11}
          active={activeFlowId === flow.id}
          onSelect={onSelectFlow}
        />
      ))}
    </group>
  )
}
