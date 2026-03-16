import { Edges, Instance, Instances, Line, useCursor } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState, type RefObject } from 'react'
import { ExtrudeGeometry, Shape } from 'three'
import type { Group, MeshStandardMaterial } from 'three'
import type { ParkDeviceConfig, ParkDeviceDetail } from '../parkDeviceConfig'
import { OFFICE_BUILDINGS, TWIN_COLORS, getStatusAccent } from './config'

function SelectionPulse({
  radius,
  color,
  active,
  warning,
}: {
  radius: number
  color: string
  active: boolean
  warning?: boolean
}) {
  const ref = useRef<Group>(null)

  useFrame(({ clock }) => {
    if (!ref.current) return
    const elapsed = clock.getElapsedTime()
    const pulse = active ? 1 + Math.sin(elapsed * 2.6) * 0.08 : 1
    ref.current.scale.setScalar(pulse)
    ref.current.rotation.y = elapsed * 0.45
    ref.current.children.forEach((child) => {
      const material = (child as any).material as MeshStandardMaterial | undefined
      if (!material) return
      const base = active ? 0.42 : 0.14
      material.opacity = base + Math.sin(elapsed * 3.2) * (warning ? 0.1 : 0.04)
    })
  })

  return (
    <group ref={ref} position={[0, 0.08, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.82, radius, 64]} />
        <meshBasicMaterial color={warning ? TWIN_COLORS.warning : color} transparent opacity={active ? 0.42 : 0.14} />
      </mesh>
      {active ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 0.64, radius * 0.68, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.22} />
        </mesh>
      ) : null}
    </group>
  )
}

function useZoneMotion(rootRef: RefObject<Group>, baseY: number, active: boolean, hovered: boolean) {
  useFrame(({ clock }) => {
    if (!rootRef.current) return
    const elapsed = clock.getElapsedTime()
    const pulse = active ? Math.sin(elapsed * 2.4) * 0.08 : hovered ? Math.sin(elapsed * 3.6) * 0.05 : 0
    const lift = active ? 0.28 : hovered ? 0.18 : 0
    rootRef.current.position.y += (baseY + lift + pulse - rootRef.current.position.y) * 0.12
  })
}

function ZoneHitBox({
  size,
  onSelect,
  onHover,
}: {
  size: [number, number, number]
  onSelect: () => void
  onHover: (hovered: boolean) => void
}) {
  return (
    <mesh
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        onHover(true)
      }}
      onPointerOut={(event) => {
        event.stopPropagation()
        onHover(false)
      }}
    >
      <boxGeometry args={size} />
      <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
    </mesh>
  )
}

function createRoundedRectShape(width: number, depth: number, radius: number) {
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const clampedRadius = Math.min(radius, halfWidth - 0.02, halfDepth - 0.02)
  const shape = new Shape()

  shape.moveTo(-halfWidth + clampedRadius, -halfDepth)
  shape.lineTo(halfWidth - clampedRadius, -halfDepth)
  shape.quadraticCurveTo(halfWidth, -halfDepth, halfWidth, -halfDepth + clampedRadius)
  shape.lineTo(halfWidth, halfDepth - clampedRadius)
  shape.quadraticCurveTo(halfWidth, halfDepth, halfWidth - clampedRadius, halfDepth)
  shape.lineTo(-halfWidth + clampedRadius, halfDepth)
  shape.quadraticCurveTo(-halfWidth, halfDepth, -halfWidth, halfDepth - clampedRadius)
  shape.lineTo(-halfWidth, -halfDepth + clampedRadius)
  shape.quadraticCurveTo(-halfWidth, -halfDepth, -halfWidth + clampedRadius, -halfDepth)

  return shape
}

function buildRectLoop(width: number, depth: number, y: number): [number, number, number][] {
  const halfWidth = width / 2
  const halfDepth = depth / 2
  return [
    [-halfWidth, y, -halfDepth],
    [halfWidth, y, -halfDepth],
    [halfWidth, y, halfDepth],
    [-halfWidth, y, halfDepth],
    [-halfWidth, y, -halfDepth],
  ]
}

function RoundedPrism({
  size,
  radius,
  color,
  accent,
  emissiveIntensity,
  roughness = 0.48,
  metalness = 0.46,
  opacity = 1,
  transparent = false,
  showEdges = true,
}: {
  size: [number, number, number]
  radius: number
  color: string
  accent: string
  emissiveIntensity: number
  roughness?: number
  metalness?: number
  opacity?: number
  transparent?: boolean
  showEdges?: boolean
}) {
  const geometry = useMemo(() => {
    const [width, height, depth] = size
    const shape = createRoundedRectShape(width, depth, radius)
    const roundedGeometry = new ExtrudeGeometry(shape, {
      depth: height,
      steps: 1,
      curveSegments: 20,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: Math.min(radius * 0.34, 0.34),
      bevelThickness: Math.min(height * 0.08, 0.2),
    })

    roundedGeometry.rotateX(-Math.PI / 2)
    roundedGeometry.translate(0, -height / 2, 0)
    return roundedGeometry
  }, [radius, size])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        emissive={accent}
        emissiveIntensity={emissiveIntensity}
        roughness={roughness}
        metalness={metalness}
        transparent={transparent || opacity < 1}
        opacity={opacity}
      />
      {showEdges ? <Edges color={accent} /> : null}
    </mesh>
  )
}

function IndustrialPipeRack({
  width,
  height,
  levels,
  accent,
  active,
}: {
  width: number
  height: number
  levels: number[]
  accent: string
  active: boolean
}) {
  const postOffsets = useMemo(
    () => Array.from({ length: 6 }, (_, index) => -width / 2 + (width / 5) * index),
    [width]
  )

  return (
    <group>
      {postOffsets.map((offset) => (
        <mesh key={offset} position={[offset, height / 2, 0]}>
          <boxGeometry args={[0.12, height, 0.12]} />
          <meshStandardMaterial color="#173149" emissive={accent} emissiveIntensity={0.2} />
        </mesh>
      ))}
      {levels.map((level, index) => (
        <group key={index}>
          <mesh position={[0, level, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.09, 0.09, width, 18]} />
            <meshStandardMaterial color="#1f4768" emissive={accent} emissiveIntensity={active ? 0.42 : 0.2} roughness={0.3} metalness={0.62} />
          </mesh>
          <mesh position={[0, level + 0.16, 0]}>
            <boxGeometry args={[width + 0.2, 0.06, 0.16]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={active ? 0.78 : 0.34} transparent opacity={0.82} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function OfficeBuilding({
  building,
  accent,
}: {
  building: { id: string; position: [number, number, number]; size: [number, number, number] }
  accent: string
}) {
  const [width, height, depth] = building.size
  const facadeCount = Math.max(4, Math.round(width))
  const facadeOffsets = useMemo(
    () =>
      Array.from({ length: facadeCount }, (_, index) => {
        if (facadeCount === 1) return 0
        return -width / 2 + 0.55 + index * ((width - 1.1) / (facadeCount - 1))
      }),
    [facadeCount, width]
  )
  const roofLine = useMemo(() => buildRectLoop(width * 0.92, depth * 0.92, height / 2 + 0.12), [depth, height, width])

  return (
    <group position={building.position}>
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[width + 1.1, 0.3, depth + 1.1]} />
        <meshStandardMaterial color="#0d1d2e" emissive={accent} emissiveIntensity={0.18} />
      </mesh>

      <group position={[0, height / 2 + 0.3, 0]}>
        <RoundedPrism size={building.size} radius={Math.min(width, depth) * 0.14} color="#122132" accent={accent} emissiveIntensity={0.2} roughness={0.5} metalness={0.38} />
        <group position={[0, 0.1, 0]}>
          <RoundedPrism
            size={[width * 0.72, height * 0.94, depth * 0.74]}
            radius={Math.min(width, depth) * 0.1}
            color="#1a3b54"
            accent={accent}
            emissiveIntensity={0.28}
            roughness={0.24}
            metalness={0.56}
            opacity={0.18}
            transparent
            showEdges={false}
          />
        </group>

        {facadeOffsets.map((offset) => (
          <group key={offset}>
            <mesh position={[offset, 0, depth / 2 + 0.05]}>
              <boxGeometry args={[0.1, height * 0.86, 0.08]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6} transparent opacity={0.78} />
            </mesh>
            <mesh position={[offset, 0, -depth / 2 - 0.05]}>
              <boxGeometry args={[0.1, height * 0.78, 0.08]} />
              <meshStandardMaterial color="#1c4565" emissive={accent} emissiveIntensity={0.26} transparent opacity={0.45} />
            </mesh>
          </group>
        ))}

        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (width / 2 + 0.04), 0.12, 0]}>
            <boxGeometry args={[0.12, height * 0.82, depth * 0.74]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.78} transparent opacity={0.78} />
          </mesh>
        ))}

        <mesh position={[0, height / 2 + 0.3, 0]}>
          <boxGeometry args={[width * 0.56, 0.24, depth * 0.28]} />
          <meshStandardMaterial color="#18324b" emissive={accent} emissiveIntensity={0.22} />
        </mesh>
        <mesh position={[-width * 0.18, height / 2 + 0.62, 0]}>
          <boxGeometry args={[width * 0.18, 0.28, depth * 0.16]} />
          <meshStandardMaterial color="#1d4c69" emissive={accent} emissiveIntensity={0.28} />
        </mesh>
        <mesh position={[width * 0.22, height / 2 + 0.72, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.12, 0.86, 18]} />
          <meshStandardMaterial color="#235c84" emissive={accent} emissiveIntensity={0.36} />
        </mesh>
        <Line points={roofLine} color={accent} lineWidth={1.1} transparent opacity={0.84} />
      </group>
    </group>
  )
}

function OfficeCluster() {
  return (
    <group>
      {OFFICE_BUILDINGS.map((building, index) => {
        const accent = index % 2 === 0 ? TWIN_COLORS.primary : TWIN_COLORS.energySoft
        return <OfficeBuilding key={building.id} building={building} accent={accent} />
      })}
    </group>
  )
}

function EnergyHubNode() {
  const ref = useRef<Group>(null)

  useFrame(({ clock }) => {
    if (!ref.current) return
    const elapsed = clock.getElapsedTime()
    ref.current.rotation.y = elapsed * 0.28
    ref.current.position.y = 1.9 + Math.sin(elapsed * 1.5) * 0.08
  })

  return (
    <group ref={ref} position={[8.2, 1.9, 0.6]}>
      <mesh position={[0, 0.4, 0]}>
        <octahedronGeometry args={[1.4, 0]} />
        <meshStandardMaterial color="#0f2131" emissive={TWIN_COLORS.primary} emissiveIntensity={0.58} roughness={0.2} metalness={0.48} />
        <Edges color={TWIN_COLORS.primary} />
      </mesh>
      <mesh position={[0, 0.4, 0]} scale={[1.8, 0.12, 1.8]}>
        <cylinderGeometry args={[1, 1, 1, 24]} />
        <meshStandardMaterial color="#14324d" emissive={TWIN_COLORS.energySoft} emissiveIntensity={0.42} transparent opacity={0.74} />
      </mesh>
      {[[-1.8, 0, -1.1], [1.8, 0, -1.1], [-1.8, 0, 1.1], [1.8, 0, 1.1]].map(([x, y, z]) => (
        <mesh key={`${x}-${z}`} position={[x, y, z]}>
          <boxGeometry args={[0.5, 2.2, 0.5]} />
          <meshStandardMaterial color="#102639" emissive={TWIN_COLORS.primarySoft} emissiveIntensity={0.24} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.35, 0]}>
        <ringGeometry args={[2.8, 3.2, 64]} />
        <meshBasicMaterial color={TWIN_COLORS.primary} transparent opacity={0.2} />
      </mesh>
    </group>
  )
}

function CAFactoryZone({
  device,
  detail,
  active,
  onSelect,
}: {
  device: ParkDeviceConfig
  detail: ParkDeviceDetail
  active: boolean
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const rootRef = useRef<Group>(null)
  const accent = getStatusAccent(detail.status, device.color)
  const skidOffsets = useMemo(() => Array.from({ length: 5 }, (_, index) => -4.3 + index * 2.15), [])
  const roofOffsets = useMemo(() => Array.from({ length: 4 }, (_, index) => -3.9 + index * 2.6), [])
  useCursor(hovered)
  useZoneMotion(rootRef, device.position[1], active, hovered)

  return (
    <group ref={rootRef} position={device.position}>
      <SelectionPulse radius={7.1} color={accent} active={active || hovered} warning={detail.status === 'warning'} />

      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[13.8, 0.34, 9]} />
        <meshStandardMaterial color="#102031" emissive={accent} emissiveIntensity={0.16} />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <boxGeometry args={[12.9, 0.16, 8.3]} />
        <meshStandardMaterial color="#16344e" emissive={accent} emissiveIntensity={0.2} />
      </mesh>

      <group position={[0, 1.78, 0]}>
        <RoundedPrism size={[11.4, 2.9, 6.7]} radius={0.46} color="#102031" accent={accent} emissiveIntensity={active ? 0.5 : 0.2} roughness={0.52} metalness={0.42} />
        <group position={[0, 0.16, 0]}>
          <RoundedPrism
            size={[10.6, 2.45, 5.95]}
            radius={0.28}
            color="#193750"
            accent={accent}
            emissiveIntensity={0.24}
            roughness={0.24}
            metalness={0.58}
            opacity={0.16}
            transparent
            showEdges={false}
          />
        </group>

        {roofOffsets.map((offset) => (
          <group key={offset} position={[offset, 1.62, -0.2]}>
            <mesh>
              <boxGeometry args={[1.9, 0.42, 1.68]} />
              <meshStandardMaterial color="#18344d" emissive={accent} emissiveIntensity={0.24} />
            </mesh>
            <mesh position={[0, 0.28, 0.4]}>
              <boxGeometry args={[1.76, 0.08, 0.18]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.86} />
            </mesh>
          </group>
        ))}

        {[-1, 1].map((side) => (
          <group key={side} position={[side * 5.15, -0.12, 0]}>
            {[-1.7, -0.55, 0.55, 1.7].map((depthOffset) => (
              <mesh key={depthOffset} position={[0, 0.58, depthOffset]}>
                <boxGeometry args={[0.16, 1.18, 0.34]} />
                <meshStandardMaterial color="#1b4364" emissive={accent} emissiveIntensity={0.42} />
              </mesh>
            ))}
          </group>
        ))}

        <mesh position={[0, -0.3, 3.04]}>
          <boxGeometry args={[10.6, 0.34, 0.6]} />
          <meshStandardMaterial color="#14293d" emissive={accent} emissiveIntensity={0.2} />
        </mesh>
        <Line points={buildRectLoop(10.9, 6.1, 1.5)} color={accent} lineWidth={0.9} transparent opacity={0.54} />
      </group>

      <group position={[0, 0.95, 3.6]}>
        {skidOffsets.map((offset) => (
          <group key={offset} position={[offset, 0, 0]}>
            <mesh position={[0, 0.2, 0]}>
              <boxGeometry args={[1.45, 0.24, 1.28]} />
              <meshStandardMaterial color="#102233" emissive={accent} emissiveIntensity={0.14} />
            </mesh>
            <group position={[0, 0.98, 0]}>
              <RoundedPrism size={[1.18, 1.6, 1.02]} radius={0.12} color="#163149" accent={accent} emissiveIntensity={active ? 0.56 : 0.24} roughness={0.38} metalness={0.58} />
            </group>
            {[0.38, 0.88].map((level) => (
              <mesh key={level} position={[0, level + 0.4, 0.58]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.08, 0.08, 1, 18]} />
                <meshStandardMaterial color="#2b648f" emissive={accent} emissiveIntensity={0.42} />
              </mesh>
            ))}
          </group>
        ))}
        <Line points={[[-5.25, 2.02, 0.62], [0, 2.1, 0.62], [5.25, 2.02, 0.62]]} color={accent} lineWidth={1.1} transparent opacity={0.84} />
      </group>

      <group position={[0, 0.76, -3.35]}>
        <IndustrialPipeRack width={10.8} height={2.2} levels={[1.02, 1.42, 1.82]} accent={accent} active={active || hovered} />
      </group>

      {[-4.9, 4.9].map((offset) => (
        <group key={offset} position={[offset, 1.72, -2.85]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.42, 0.42, 3.2, 24]} />
            <meshStandardMaterial color="#17344b" emissive={accent} emissiveIntensity={0.26} roughness={0.34} metalness={0.6} />
            <Edges color={accent} />
          </mesh>
          <mesh position={[1.72, 1.12, 0]}>
            <cylinderGeometry args={[0.18, 0.24, 2.1, 20]} />
            <meshStandardMaterial color="#1c4967" emissive={accent} emissiveIntensity={0.3} />
          </mesh>
        </group>
      ))}

      <group position={[0, 1.55, 0]}>
        <ZoneHitBox size={[14.2, 5.2, 9.4]} onSelect={onSelect} onHover={setHovered} />
      </group>
    </group>
  )
}

function PemModule({
  position,
  accent,
  active,
}: {
  position: [number, number, number]
  accent: string
  active: boolean
}) {
  const ventOffsets = useMemo(() => Array.from({ length: 5 }, (_, index) => -1.2 + index * 0.6), [])

  return (
    <group position={position}>
      <RoundedPrism size={[2.35, 2.2, 4.3]} radius={0.18} color="#13283b" accent={accent} emissiveIntensity={active ? 0.5 : 0.2} roughness={0.4} metalness={0.54} />
      <group position={[0, 0.08, 0]}>
        <RoundedPrism
          size={[2.04, 1.84, 3.94]}
          radius={0.14}
          color="#1a3a50"
          accent={accent}
          emissiveIntensity={0.26}
          roughness={0.2}
          metalness={0.58}
          opacity={0.16}
          transparent
          showEdges={false}
        />
      </group>

      {[-1, 1].map((side) => (
        <group key={side}>
          {ventOffsets.map((offset) => (
            <mesh key={offset} position={[side * 1.2, 0.1, offset]}>
              <boxGeometry args={[0.08, 1.18, 0.22]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={side > 0 ? 0.56 : 0.3} transparent opacity={side > 0 ? 0.82 : 0.46} />
            </mesh>
          ))}
        </group>
      ))}

      {[-1, 1].flatMap((side) => [-1, 1].map((end) => ({ side, end }))).map(({ side, end }) => (
        <mesh key={`${side}-${end}`} position={[side * 1.04, -0.08, end * 1.86]}>
          <boxGeometry args={[0.16, 1.76, 0.16]} />
          <meshStandardMaterial color="#1b425f" emissive={accent} emissiveIntensity={0.24} />
        </mesh>
      ))}

      {[-0.62, 0.62].map((offset) => (
        <group key={offset} position={[offset, 1.26, -0.42]}>
          <mesh>
            <cylinderGeometry args={[0.2, 0.2, 0.3, 20]} />
            <meshStandardMaterial color="#235677" emissive={accent} emissiveIntensity={0.36} />
          </mesh>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.1, 0.16, 0.22, 18]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.72} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, 0.48, 2.18]}>
        <boxGeometry args={[1.42, 0.14, 0.08]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.82} />
      </mesh>
      <mesh position={[0, -0.76, 0]}>
        <boxGeometry args={[2.54, 0.18, 4.54]} />
        <meshStandardMaterial color="#102132" emissive={accent} emissiveIntensity={0.14} />
      </mesh>
    </group>
  )
}

function PemZone({
  device,
  detail,
  active,
  onSelect,
}: {
  device: ParkDeviceConfig
  detail: ParkDeviceDetail
  active: boolean
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const rootRef = useRef<Group>(null)
  const accent = getStatusAccent(detail.status, device.color)
  useCursor(hovered)
  useZoneMotion(rootRef, device.position[1], active, hovered)

  return (
    <group ref={rootRef} position={device.position}>
      <SelectionPulse radius={4.6} color={accent} active={active || hovered} warning={detail.status === 'warning'} />
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[7.2, 0.32, 6.2]} />
        <meshStandardMaterial color="#0f1f2f" emissive={accent} emissiveIntensity={0.15} />
      </mesh>

      <PemModule position={[-1.65, 1.54, 0.1]} accent={accent} active={active || hovered} />
      <PemModule position={[1.65, 1.54, -0.12]} accent={accent} active={active || hovered} />

      <group position={[0, 2.54, -0.05]}>
        <mesh>
          <boxGeometry args={[3.9, 0.16, 0.28]} />
          <meshStandardMaterial color="#1f4b69" emissive={accent} emissiveIntensity={0.34} />
        </mesh>
        <mesh position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 3.4, 18]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.82} />
        </mesh>
      </group>

      {[-1.55, 0, 1.55].map((offset) => (
        <group key={offset} position={[offset, 0.98, 2.34]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.34, 0.34, 1.02, 22]} />
            <meshStandardMaterial color="#17324a" emissive={accent} emissiveIntensity={active ? 0.42 : 0.2} roughness={0.32} metalness={0.6} />
            <Edges color={accent} />
          </mesh>
          <mesh position={[0, 0.28, 0.54]}>
            <boxGeometry args={[0.14, 0.5, 0.08]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.72} />
          </mesh>
        </group>
      ))}

      <group position={[0, 1.52, -2.42]}>
        <IndustrialPipeRack width={4.8} height={1.7} levels={[0.78, 1.12]} accent={accent} active={active || hovered} />
      </group>

      <group position={[0, 1.5, 0]}>
        <ZoneHitBox size={[7.6, 4.8, 6.4]} onSelect={onSelect} onHover={setHovered} />
      </group>
    </group>
  )
}

function TurbineZone({
  device,
  detail,
  active,
  onSelect,
}: {
  device: ParkDeviceConfig
  detail: ParkDeviceDetail
  active: boolean
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const rootRef = useRef<Group>(null)
  const accent = getStatusAccent(detail.status, device.color)
  const skidOffsets = useMemo(() => [-1.9, 0, 1.9], [])
  useCursor(hovered)
  useZoneMotion(rootRef, device.position[1], active, hovered)

  return (
    <group ref={rootRef} position={device.position}>
      <SelectionPulse radius={4.4} color={accent} active={active || hovered} warning={detail.status === 'warning'} />

      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[7.6, 0.34, 5.2]} />
        <meshStandardMaterial color="#102233" emissive={accent} emissiveIntensity={0.16} />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <boxGeometry args={[7.1, 0.14, 4.7]} />
        <meshStandardMaterial color="#173149" emissive={accent} emissiveIntensity={0.2} />
      </mesh>

      <group position={[0.35, 1.54, -0.2]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.92, 1.02, 4.6, 24]} />
          <meshStandardMaterial color="#142a40" emissive={accent} emissiveIntensity={active ? 0.6 : 0.22} roughness={0.34} metalness={0.66} />
          <Edges color={accent} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.68, 0.82, 4.05, 24]} />
          <meshStandardMaterial color="#1a3954" emissive={accent} emissiveIntensity={0.24} roughness={0.24} metalness={0.6} transparent opacity={0.18} />
        </mesh>
      </group>

      <mesh position={[-2.8, 1.52, -0.2]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.94, 1.22, 24]} />
        <meshStandardMaterial color="#17344c" emissive={accent} emissiveIntensity={0.34} roughness={0.32} metalness={0.56} />
        <Edges color={accent} />
      </mesh>
      <mesh position={[-3.5, 1.52, -0.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.44, 0.62, 0.8, 20]} />
        <meshStandardMaterial color="#214e72" emissive={accent} emissiveIntensity={0.42} />
      </mesh>

      <group position={[2.65, 1.46, -0.18]}>
        <RoundedPrism size={[1.5, 1.9, 1.78]} radius={0.18} color="#153149" accent={accent} emissiveIntensity={active ? 0.46 : 0.2} roughness={0.36} metalness={0.54} />
        <mesh position={[0, 1.12, 0]}>
          <boxGeometry args={[1.1, 0.18, 1.24]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6} />
        </mesh>
      </group>

      <group position={[3.18, 2.28, -0.62]}>
        <mesh>
          <cylinderGeometry args={[0.28, 0.4, 2.6, 20]} />
          <meshStandardMaterial color="#1c3f5b" emissive={accent} emissiveIntensity={0.34} roughness={0.28} metalness={0.58} />
          <Edges color={accent} />
        </mesh>
        <mesh position={[0, 1.38, 0]}>
          <cylinderGeometry args={[0.38, 0.46, 0.36, 18]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.72} />
        </mesh>
      </group>

      <group position={[-0.2, 0.58, 1.78]}>
        {skidOffsets.map((offset) => (
          <group key={offset} position={[offset, 0, 0]}>
            <mesh position={[0, 0.44, 0]}>
              <boxGeometry args={[1.32, 0.88, 0.68]} />
              <meshStandardMaterial color="#173149" emissive={accent} emissiveIntensity={0.24} />
            </mesh>
            <mesh position={[0, 0.96, 0]}>
              <boxGeometry args={[1.08, 0.08, 0.52]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.74} />
            </mesh>
          </group>
        ))}
      </group>

      <group position={[0.1, 0.82, -1.95]}>
        <IndustrialPipeRack width={5.8} height={1.7} levels={[0.76, 1.12]} accent={accent} active={active || hovered} />
      </group>

      <Line points={[[-3.2, 1.88, -1.38], [-0.1, 2.14, -1.18], [2.95, 1.82, -1.24]]} color={accent} lineWidth={1.05} transparent opacity={0.82} />

      <group position={[0, 1.55, 0]}>
        <ZoneHitBox size={[8.2, 5, 5.6]} onSelect={onSelect} onHover={setHovered} />
      </group>
    </group>
  )
}

function HydrogenTankVessel({
  position,
  accent,
  active,
}: {
  position: [number, number, number]
  accent: string
  active: boolean
}) {
  const rungOffsets = useMemo(() => Array.from({ length: 7 }, (_, index) => -0.82 + index * 0.38), [])

  return (
    <group position={position}>
      <mesh position={[0, 1.92, 0]}>
        <cylinderGeometry args={[0.82, 0.86, 2.84, 28]} />
        <meshStandardMaterial color="#12283d" emissive={accent} emissiveIntensity={active ? 0.54 : 0.22} roughness={0.34} metalness={0.6} />
        <Edges color={accent} />
      </mesh>

      <mesh position={[0, 3.38, 0]} scale={[1, 0.5, 1]}>
        <sphereGeometry args={[0.86, 28, 18]} />
        <meshStandardMaterial color="#163149" emissive={accent} emissiveIntensity={active ? 0.46 : 0.2} roughness={0.28} metalness={0.54} />
      </mesh>
      <mesh position={[0, 0.46, 0]} scale={[1, 0.5, 1]}>
        <sphereGeometry args={[0.86, 28, 18]} />
        <meshStandardMaterial color="#163149" emissive={accent} emissiveIntensity={active ? 0.4 : 0.18} roughness={0.28} metalness={0.54} />
      </mesh>

      <mesh position={[0, 2.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.02, 0.05, 10, 28]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.76} transparent opacity={0.74} />
      </mesh>
      <mesh position={[0, 3.64, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 1.2, 18]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.72} />
      </mesh>
      <mesh position={[0, 3.98, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 0.24, 18]} />
        <meshStandardMaterial color="#244e6b" emissive={accent} emissiveIntensity={0.4} />
      </mesh>

      {[-1, 1].flatMap((side) => [-1, 1].map((depth) => ({ side, depth }))).map(({ side, depth }) => (
        <mesh key={`${side}-${depth}`} position={[side * 0.44, 0.38, depth * 0.44]}>
          <boxGeometry args={[0.12, 0.68, 0.12]} />
          <meshStandardMaterial color="#1b425f" emissive={accent} emissiveIntensity={0.24} />
        </mesh>
      ))}

      <group position={[0.76, 1.82, 0]}>
        <mesh position={[0, 0.1, 0.02]}>
          <boxGeometry args={[0.08, 2.74, 0.08]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.82} transparent opacity={0.78} />
        </mesh>
        <mesh position={[-0.2, 0.1, 0.02]}>
          <boxGeometry args={[0.08, 2.74, 0.08]} />
          <meshStandardMaterial color="#1c4566" emissive={accent} emissiveIntensity={0.28} transparent opacity={0.52} />
        </mesh>
        {rungOffsets.map((offset) => (
          <mesh key={offset} position={[-0.1, offset, 0.02]}>
            <boxGeometry args={[0.26, 0.05, 0.05]} />
            <meshStandardMaterial color="#1d496a" emissive={accent} emissiveIntensity={0.26} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function HydrogenTankZone({
  device,
  detail,
  active,
  onSelect,
}: {
  device: ParkDeviceConfig
  detail: ParkDeviceDetail
  active: boolean
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const rootRef = useRef<Group>(null)
  const accent = getStatusAccent(detail.status, device.color)
  useCursor(hovered)
  useZoneMotion(rootRef, device.position[1], active, hovered)

  return (
    <group ref={rootRef} position={device.position}>
      <SelectionPulse radius={4.6} color={accent} active={active || hovered} warning={detail.status === 'warning'} />
      <mesh position={[0, 0.14, 0]}>
        <boxGeometry args={[6.6, 0.28, 4.8]} />
        <meshStandardMaterial color="#102130" emissive={accent} emissiveIntensity={0.18} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
        <ringGeometry args={[1.7, 2.7, 64]} />
        <meshBasicMaterial color={accent} transparent opacity={0.18} />
      </mesh>

      <HydrogenTankVessel position={[-1.95, 0, 0]} accent={accent} active={active || hovered} />
      <HydrogenTankVessel position={[0, 0.04, 0.18]} accent={accent} active={active || hovered} />
      <HydrogenTankVessel position={[1.95, 0, -0.08]} accent={accent} active={active || hovered} />

      <group position={[0, 4.05, 0]}>
        <mesh>
          <boxGeometry args={[4.8, 0.16, 0.24]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.54} />
        </mesh>
        <mesh position={[0, -0.26, 0.42]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 4.1, 18]} />
          <meshStandardMaterial color="#2d5a81" emissive={accent} emissiveIntensity={0.36} />
        </mesh>
      </group>

      <group position={[0, 0.34, 1.68]}>
        <IndustrialPipeRack width={5.4} height={0.86} levels={[0.28, 0.54]} accent={accent} active={active || hovered} />
      </group>

      <group position={[0, 2.12, 0]}>
        <ZoneHitBox size={[6.9, 5.6, 5.2]} onSelect={onSelect} onHover={setHovered} />
      </group>
    </group>
  )
}

function SolarArrayZone({
  device,
  detail,
  active,
  onSelect,
}: {
  device: ParkDeviceConfig
  detail: ParkDeviceDetail
  active: boolean
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const rootRef = useRef<Group>(null)
  const accent = getStatusAccent(detail.status, device.color)
  const panelPositions = useMemo(
    () =>
      Array.from({ length: 4 * 7 }, (_, index) => {
        const row = Math.floor(index / 7)
        const col = index % 7
        return {
          x: (col - 3) * 2.45,
          z: (row - 1.5) * 1.8,
        }
      }),
    []
  )
  useCursor(hovered)
  useZoneMotion(rootRef, device.position[1], active, hovered)

  return (
    <group ref={rootRef} position={device.position}>
      <SelectionPulse radius={7.5} color={accent} active={active || hovered} warning={detail.status === 'warning'} />
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[18.9, 0.24, 11.8]} />
        <meshStandardMaterial color="#0f1f2f" emissive={accent} emissiveIntensity={0.12} />
      </mesh>
      <Line points={buildRectLoop(18.1, 10.9, 0.18)} color={accent} lineWidth={0.9} transparent opacity={0.5} />

      <Instances limit={panelPositions.length}>
        <boxGeometry args={[2.1, 0.08, 1.22]} />
        <meshStandardMaterial color="#102238" emissive={accent} emissiveIntensity={active ? 0.72 : hovered ? 0.48 : 0.22} roughness={0.16} metalness={0.52} />
        {panelPositions.map((panel, index) => (
          <Instance key={index} position={[panel.x, 1.1, panel.z]} rotation={[-0.52, 0.22, 0]} />
        ))}
      </Instances>
      <Instances limit={panelPositions.length}>
        <boxGeometry args={[2.22, 0.04, 1.34]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.92} transparent opacity={0.85} />
        {panelPositions.map((panel, index) => (
          <Instance key={index} position={[panel.x, 1.03, panel.z]} rotation={[-0.52, 0.22, 0]} />
        ))}
      </Instances>

      <Instances limit={panelPositions.length}>
        <boxGeometry args={[1.86, 0.05, 0.08]} />
        <meshStandardMaterial color="#1e4666" emissive={accent} emissiveIntensity={0.26} />
        {panelPositions.map((panel, index) => (
          <Instance key={index} position={[panel.x, 0.8, panel.z]} rotation={[-0.52, 0.22, 0]} />
        ))}
      </Instances>

      {panelPositions.filter((_, index) => index % 2 === 0).map((panel, index) => (
        <group key={index} position={[panel.x, 0.52, panel.z]} rotation={[0, 0.22, 0]}>
          <mesh position={[0, 0.28, 0]}>
            <boxGeometry args={[0.08, 0.56, 0.08]} />
            <meshStandardMaterial color="#17324a" emissive={accent} emissiveIntensity={0.18} />
          </mesh>
          <mesh position={[0, 0.54, 0]}>
            <boxGeometry args={[0.9, 0.06, 0.06]} />
            <meshStandardMaterial color="#1e4666" emissive={accent} emissiveIntensity={0.22} />
          </mesh>
        </group>
      ))}

      {panelPositions.map((panel, index) => (
        <group key={`support-${index}`} position={[panel.x, 0.18, panel.z]} rotation={[0, 0.22, 0]}>
          <mesh position={[-0.58, 0.34, 0.34]}>
            <boxGeometry args={[0.06, 0.68, 0.06]} />
            <meshStandardMaterial color="#18344d" emissive={accent} emissiveIntensity={0.16} />
          </mesh>
          <mesh position={[0.58, 0.34, 0.34]}>
            <boxGeometry args={[0.06, 0.68, 0.06]} />
            <meshStandardMaterial color="#18344d" emissive={accent} emissiveIntensity={0.16} />
          </mesh>
          <mesh position={[0, 0.62, -0.26]} rotation={[0.56, 0, 0]}>
            <boxGeometry args={[1.52, 0.05, 0.06]} />
            <meshStandardMaterial color="#214a68" emissive={accent} emissiveIntensity={0.18} />
          </mesh>
        </group>
      ))}

      {[-6.2, 6.2].map((offset) => (
        <group key={offset} position={[offset, 0.64, 4.75]}>
          <RoundedPrism size={[1.42, 1.12, 1.1]} radius={0.12} color="#173149" accent={accent} emissiveIntensity={active ? 0.44 : 0.18} roughness={0.42} metalness={0.46} />
          <mesh position={[0, 0.74, 0]}>
            <boxGeometry args={[0.96, 0.12, 0.08]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.78} />
          </mesh>
        </group>
      ))}

      <Line points={[[-7.6, 0.28, 4.7], [-3.2, 0.28, 2.8], [0, 0.28, 0.2], [3.2, 0.28, -2.6], [7.5, 0.28, -4.8]]} color={accent} lineWidth={0.95} transparent opacity={0.72} />

      <group position={[0, 1.22, 0]}>
        <ZoneHitBox size={[19.2, 4.6, 12]} onSelect={onSelect} onHover={setHovered} />
      </group>
    </group>
  )
}

function BatteryCabinet({
  position,
  accent,
  active,
}: {
  position: [number, number, number]
  accent: string
  active: boolean
}) {
  return (
    <group position={position}>
      <RoundedPrism size={[1.12, 2.42, 1.24]} radius={0.12} color="#13263a" accent={accent} emissiveIntensity={active ? 0.5 : 0.18} roughness={0.5} metalness={0.44} />
      <mesh position={[0, 0.04, 0.66]}>
        <boxGeometry args={[0.74, 1.64, 0.05]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.88} />
      </mesh>
      <mesh position={[0, 1.28, 0.02]}>
        <boxGeometry args={[0.82, 0.14, 0.12]} />
        <meshStandardMaterial color={TWIN_COLORS.storage} emissive={TWIN_COLORS.storage} emissiveIntensity={0.8} />
      </mesh>
      {[-1, 1].flatMap((side) => [-1, 1].map((depth) => ({ side, depth }))).map(({ side, depth }) => (
        <mesh key={`${side}-${depth}`} position={[side * 0.44, -0.06, depth * 0.5]}>
          <boxGeometry args={[0.12, 1.92, 0.12]} />
          <meshStandardMaterial color="#1c4361" emissive={accent} emissiveIntensity={0.2} />
        </mesh>
      ))}
      <mesh position={[0, 1.46, 0]}>
        <boxGeometry args={[0.84, 0.16, 0.78]} />
        <meshStandardMaterial color="#1d4969" emissive={accent} emissiveIntensity={0.24} />
      </mesh>
    </group>
  )
}

function StorageBankZone({
  device,
  detail,
  active,
  onSelect,
}: {
  device: ParkDeviceConfig
  detail: ParkDeviceDetail
  active: boolean
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const rootRef = useRef<Group>(null)
  const accent = getStatusAccent(detail.status, device.color)
  const cabinetSlots = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => {
        const row = Math.floor(index / 4)
        const col = index % 4
        return {
          x: (col - 1.5) * 1.7,
          z: (row - 0.5) * 1.8,
        }
      }),
    []
  )
  useCursor(hovered)
  useZoneMotion(rootRef, device.position[1], active, hovered)

  return (
    <group ref={rootRef} position={device.position}>
      <SelectionPulse radius={5.3} color={accent} active={active || hovered} warning={detail.status === 'warning'} />
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[8.6, 0.34, 5.2]} />
        <meshStandardMaterial color="#10202f" emissive={accent} emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <boxGeometry args={[8.1, 0.1, 4.7]} />
        <meshStandardMaterial color="#173149" emissive={accent} emissiveIntensity={0.18} />
      </mesh>

      {cabinetSlots.map((cabinet, index) => (
        <group key={index}>
          <mesh position={[cabinet.x, 0.26, cabinet.z]}>
            <boxGeometry args={[1.34, 0.22, 1.5]} />
            <meshStandardMaterial color="#102233" emissive={accent} emissiveIntensity={0.14} />
          </mesh>
          <BatteryCabinet position={[cabinet.x, 1.48, cabinet.z]} accent={accent} active={active || hovered} />
        </group>
      ))}

      {[-2.55, 2.55].map((offset) => (
        <group key={offset} position={[offset, 0.82, -2.32]}>
          <RoundedPrism size={[2.1, 1.52, 0.96]} radius={0.12} color="#173149" accent={accent} emissiveIntensity={active ? 0.42 : 0.18} roughness={0.42} metalness={0.46} />
          <mesh position={[0, 0.92, 0]}>
            <boxGeometry args={[1.3, 0.14, 0.08]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.74} />
          </mesh>
        </group>
      ))}

      <group position={[0, 2.72, 0]}>
        <mesh>
          <boxGeometry args={[6.4, 0.14, 0.18]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.82} />
        </mesh>
        {[-2.55, -0.85, 0.85, 2.55].map((offset) => (
          <mesh key={offset} position={[offset, -0.86, 0]}>
            <boxGeometry args={[0.08, 1.72, 0.08]} />
            <meshStandardMaterial color="#1d4b68" emissive={accent} emissiveIntensity={0.24} />
          </mesh>
        ))}
      </group>

      <group position={[0, 0.46, 2.18]}>
        <IndustrialPipeRack width={6.2} height={0.9} levels={[0.28, 0.52]} accent={accent} active={active || hovered} />
      </group>

      <group position={[0, 1.56, 0]}>
        <ZoneHitBox size={[9.2, 5, 5.8]} onSelect={onSelect} onHover={setHovered} />
      </group>
    </group>
  )
}

export default function ParkAssets({
  devices,
  deviceDetails,
  activeDeviceId,
  onSelectDevice,
}: {
  devices: ParkDeviceConfig[]
  deviceDetails: Record<string, ParkDeviceDetail>
  activeDeviceId: string
  onSelectDevice: (id: string) => void
}) {
  const deviceMap = useMemo(
    () => Object.fromEntries(devices.map((device) => [device.id, device])) as Record<string, ParkDeviceConfig>,
    [devices]
  )

  return (
    <group>
      <OfficeCluster />
      <EnergyHubNode />

      <CAFactoryZone
        device={deviceMap['ca-main']}
        detail={deviceDetails['ca-main']}
        active={activeDeviceId === 'ca-main'}
        onSelect={() => onSelectDevice('ca-main')}
      />
      <PemZone
        device={deviceMap['pem-unit']}
        detail={deviceDetails['pem-unit']}
        active={activeDeviceId === 'pem-unit'}
        onSelect={() => onSelectDevice('pem-unit')}
      />
      <SolarArrayZone
        device={deviceMap['pv-field']}
        detail={deviceDetails['pv-field']}
        active={activeDeviceId === 'pv-field'}
        onSelect={() => onSelectDevice('pv-field')}
      />
      <TurbineZone
        device={deviceMap['gm-unit']}
        detail={deviceDetails['gm-unit']}
        active={activeDeviceId === 'gm-unit'}
        onSelect={() => onSelectDevice('gm-unit')}
      />
      <HydrogenTankZone
        device={deviceMap['hs-tank']}
        detail={deviceDetails['hs-tank']}
        active={activeDeviceId === 'hs-tank'}
        onSelect={() => onSelectDevice('hs-tank')}
      />
      <StorageBankZone
        device={deviceMap['es-bank']}
        detail={deviceDetails['es-bank']}
        active={activeDeviceId === 'es-bank'}
        onSelect={() => onSelectDevice('es-bank')}
      />
    </group>
  )
}
