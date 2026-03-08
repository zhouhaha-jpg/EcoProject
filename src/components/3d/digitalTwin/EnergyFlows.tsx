import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CatmullRomCurve3, Group, MeshStandardMaterial, Object3D, TubeGeometry, Vector3 } from 'three'
import type { TwinFlow } from './types'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function FlowTube({ flow }: { flow: TwinFlow }) {
  const materialRef = useRef<MeshStandardMaterial>(null)
  const curve = useMemo(() => new CatmullRomCurve3(flow.points.map((point) => new Vector3(...point))), [flow.points])
  const geometry = useMemo(() => new TubeGeometry(curve, 96, 0.08, 8, false), [curve])

  useFrame(({ clock }) => {
    if (!materialRef.current) return
    const elapsed = clock.getElapsedTime()
    const baseOpacity = flow.status === 'warning' ? 0.18 : 0.12
    materialRef.current.opacity = baseOpacity + Math.sin(elapsed * 2 + flow.value * 0.0004) * 0.035
  })

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        ref={materialRef}
        color={flow.color}
        emissive={flow.color}
        emissiveIntensity={0.55}
        transparent
        opacity={0.12}
        roughness={0.28}
        metalness={0.32}
      />
    </mesh>
  )
}

function FlowParticles({ flow, pulseOffset }: { flow: TwinFlow; pulseOffset: number }) {
  const meshRef = useRef<any>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const curve = useMemo(() => new CatmullRomCurve3(flow.points.map((point) => new Vector3(...point))), [flow.points])
  const count = useMemo(() => clamp(Math.round(flow.value / 650) + 6, 7, 24), [flow.value])
  const speed = useMemo(() => clamp(flow.value / 9000, 0.15, 0.68), [flow.value])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const elapsed = clock.getElapsedTime()

    for (let index = 0; index < count; index += 1) {
      const offset = (index / count + pulseOffset) % 1
      const rawProgress = (elapsed * speed + offset) % 1
      const progress = flow.direction === 1 ? rawProgress : 1 - rawProgress
      const position = curve.getPointAt(progress)
      const next = curve.getPointAt((progress + 0.015) % 1)

      dummy.position.copy(position)
      dummy.lookAt(next)

      const scale = 0.12 + ((index % 3) * 0.02)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(index, dummy.matrix)
    }

    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshStandardMaterial color="#dffbff" emissive={flow.color} emissiveIntensity={1.15} toneMapped={false} />
    </instancedMesh>
  )
}

function PulseOrb({ flow }: { flow: TwinFlow }) {
  const ref = useRef<Group>(null)
  const curve = useMemo(() => new CatmullRomCurve3(flow.points.map((point) => new Vector3(...point))), [flow.points])
  const speed = clamp(flow.value / 6400, 0.28, 0.88)

  useFrame(({ clock }) => {
    if (!ref.current) return
    const elapsed = clock.getElapsedTime()
    const rawProgress = (elapsed * speed) % 1
    const progress = flow.direction === 1 ? rawProgress : 1 - rawProgress
    const position = curve.getPointAt(progress)
    ref.current.position.copy(position)

    const material = (ref.current.children[0] as any)?.material as MeshStandardMaterial | undefined
    if (material) {
      material.emissiveIntensity = 1.05 + Math.sin(elapsed * 6 + speed) * 0.25
    }
  })

  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.18, 14, 14]} />
        <meshStandardMaterial color="#ffffff" emissive={flow.color} emissiveIntensity={1.08} toneMapped={false} />
      </mesh>
    </group>
  )
}

export default function EnergyFlows({ flows }: { flows: TwinFlow[] }) {
  return (
    <group>
      {flows.map((flow, index) => (
        <group key={flow.id}>
          <FlowTube flow={flow} />
          <FlowParticles flow={flow} pulseOffset={index * 0.13} />
          <PulseOrb flow={flow} />
        </group>
      ))}
    </group>
  )
}
