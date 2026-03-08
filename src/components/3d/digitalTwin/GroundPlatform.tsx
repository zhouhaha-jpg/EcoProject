import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { ExtrudeGeometry, Group, Shape } from 'three'
import { CIRCUIT_LINES, PARK_BOUNDARY, TWIN_COLORS } from './config'

function buildTechShape(width: number, depth: number, cut: number) {
  const shape = new Shape()
  const halfW = width / 2
  const halfD = depth / 2

  shape.moveTo(-halfW + cut, -halfD)
  shape.lineTo(halfW - cut, -halfD)
  shape.lineTo(halfW, -halfD + cut)
  shape.lineTo(halfW, halfD - cut)
  shape.lineTo(halfW - cut, halfD)
  shape.lineTo(-halfW + cut, halfD)
  shape.lineTo(-halfW, halfD - cut)
  shape.lineTo(-halfW, -halfD + cut)
  shape.closePath()
  return shape
}

function PlatformLayer({
  width,
  depth,
  height,
  color,
  emissive,
  y,
}: {
  width: number
  depth: number
  height: number
  color: string
  emissive: string
  y: number
}) {
  const geometry = useMemo(
    () =>
      new ExtrudeGeometry(buildTechShape(width, depth, 3.5), {
        depth: height,
        bevelEnabled: false,
      }),
    [depth, height, width]
  )

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, y, depth / 2]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.18} roughness={0.85} metalness={0.32} />
      </mesh>
    </group>
  )
}

function ScannerRing({ radius, speed, color, opacity }: { radius: number; speed: number; color: string; opacity: number }) {
  const ringRef = useRef<any>(null)

  useFrame(({ clock }) => {
    if (!ringRef.current) return
    const elapsed = clock.getElapsedTime()
    const pulse = 1 + Math.sin(elapsed * speed) * 0.06
    ringRef.current.rotation.z = elapsed * speed * 0.12
    ringRef.current.scale.setScalar(pulse)
    ringRef.current.material.opacity = opacity + Math.sin(elapsed * speed * 1.4) * 0.05
  })

  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.14, 0]}>
      <ringGeometry args={[radius - 0.18, radius, 96]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  )
}

function DataTower({ position, height, color }: { position: [number, number, number]; height: number; color: string }) {
  const ref = useRef<Group>(null)

  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.position.y = position[1] + Math.sin(clock.getElapsedTime() * 1.4 + position[0] * 0.2) * 0.05
  })

  return (
    <group ref={ref} position={position}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.18, height, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} transparent opacity={0.76} />
      </mesh>
      <mesh position={[0, height + 0.14, 0]}>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshStandardMaterial color="#d9fdff" emissive={color} emissiveIntensity={1.15} />
      </mesh>
    </group>
  )
}

export default function GroundPlatform() {
  const topGridRef = useRef<Group>(null)

  useFrame(({ clock }) => {
    if (!topGridRef.current) return
    topGridRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.08) * 0.02
  })

  return (
    <group>
      <PlatformLayer width={58} depth={40} height={1.2} color={TWIN_COLORS.platform} emissive={TWIN_COLORS.primary} y={-1.45} />
      <PlatformLayer width={52} depth={34} height={0.7} color={TWIN_COLORS.platformMid} emissive={TWIN_COLORS.primarySoft} y={-0.6} />
      <PlatformLayer width={46} depth={28} height={0.34} color={TWIN_COLORS.platformTop} emissive={TWIN_COLORS.energySoft} y={-0.05} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.11, 0]}>
        <planeGeometry args={[48, 30]} />
        <meshStandardMaterial color="#0b1624" roughness={0.94} metalness={0.12} />
      </mesh>

      <group ref={topGridRef}>
        <Line points={PARK_BOUNDARY} color={TWIN_COLORS.primary} lineWidth={1.2} transparent opacity={0.9} />
        {CIRCUIT_LINES.map((points, index) => (
          <Line
            key={index}
            points={points}
            color={index % 2 === 0 ? TWIN_COLORS.line : TWIN_COLORS.energySoft}
            lineWidth={0.8}
            transparent
            opacity={0.65}
          />
        ))}
      </group>

      <ScannerRing radius={6.4} speed={1.2} color={TWIN_COLORS.primary} opacity={0.28} />
      <ScannerRing radius={10.8} speed={0.78} color={TWIN_COLORS.energySoft} opacity={0.16} />
      <ScannerRing radius={15.8} speed={0.52} color={TWIN_COLORS.primarySoft} opacity={0.1} />

      <DataTower position={[-18, 0.12, 13]} height={5.4} color={TWIN_COLORS.primary} />
      <DataTower position={[-2, 0.12, -14]} height={4.6} color={TWIN_COLORS.energy} />
      <DataTower position={[17, 0.12, 13]} height={5.1} color={TWIN_COLORS.storage} />
    </group>
  )
}
