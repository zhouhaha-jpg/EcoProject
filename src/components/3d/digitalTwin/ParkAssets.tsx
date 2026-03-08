import { Edges, Instance, Instances, Line, useCursor } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState, type RefObject } from 'react'
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

function OfficeCluster() {
  return (
    <group>
      {OFFICE_BUILDINGS.map((building, index) => {
        const accent = index % 2 === 0 ? TWIN_COLORS.primary : TWIN_COLORS.energySoft
        return (
          <group key={building.id} position={building.position}>
            <mesh>
              <boxGeometry args={[building.size[0] + 0.9, 0.3, building.size[2] + 0.9]} />
              <meshStandardMaterial color="#0d1d2e" emissive={accent} emissiveIntensity={0.18} />
            </mesh>
            <mesh position={[0, building.size[1] / 2 + 0.2, 0]}>
              <boxGeometry args={building.size} />
              <meshStandardMaterial color="#122132" emissive={accent} emissiveIntensity={0.18} roughness={0.56} metalness={0.42} />
              <Edges color={accent} />
            </mesh>
            <mesh position={[0, building.size[1] + 0.7, 0]}>
              <boxGeometry args={[building.size[0] * 0.62, 0.3, building.size[2] * 0.4]} />
              <meshStandardMaterial color="#18324b" emissive={accent} emissiveIntensity={0.22} />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * (building.size[0] / 2 + 0.03), building.size[1] / 2 + 0.2, 0]}>
                <boxGeometry args={[0.1, building.size[1] * 0.82, building.size[2] * 0.7]} />
                <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.72} transparent opacity={0.86} />
              </mesh>
            ))}
          </group>
        )
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
  useCursor(hovered)
  useZoneMotion(rootRef, device.position[1], active, hovered)

  return (
    <group ref={rootRef} position={device.position}>
      <SelectionPulse radius={6.8} color={accent} active={active || hovered} warning={detail.status === 'warning'} />
      <mesh position={[0, 1.45, 0]}>
        <boxGeometry args={[12.4, 2.9, 7.8]} />
        <meshStandardMaterial color="#102031" emissive={accent} emissiveIntensity={active ? 0.46 : 0.18} roughness={0.56} metalness={0.42} />
        <Edges color={accent} />
      </mesh>
      <mesh position={[0, 3.08, 0]}>
        <boxGeometry args={[12.8, 0.26, 8.1]} />
        <meshStandardMaterial color="#17344f" emissive={accent} emissiveIntensity={0.24} />
      </mesh>
      {[-4.2, -1.6, 1.6, 4.2].map((offset) => (
        <mesh key={offset} position={[offset, 1.7, 1.4]}>
          <boxGeometry args={[1.45, 2.2, 1.9]} />
          <meshStandardMaterial color="#153149" emissive={accent} emissiveIntensity={active ? 0.62 : 0.24} roughness={0.42} metalness={0.54} />
          <Edges color={accent} />
        </mesh>
      ))}
      <mesh position={[0, 1.18, -3.3]}>
        <boxGeometry args={[11.6, 1.6, 1.2]} />
        <meshStandardMaterial color="#14293d" emissive={accent} emissiveIntensity={0.18} />
      </mesh>
      <Line points={[[-5.8, 3.2, -2.8], [0, 3.4, -2.2], [5.8, 3.2, -2.8]]} color={accent} lineWidth={1.1} transparent opacity={0.7} />
      <group position={[0, 1.4, 0]}>
        <ZoneHitBox size={[13.5, 4.6, 9]} onSelect={onSelect} onHover={setHovered} />
      </group>
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
      <SelectionPulse radius={4.1} color={accent} active={active || hovered} warning={detail.status === 'warning'} />
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[6.5, 0.34, 5.4]} />
        <meshStandardMaterial color="#0f1f2f" emissive={accent} emissiveIntensity={0.15} />
      </mesh>
      {[-1.9, 0, 1.9].map((offset) => (
        <mesh key={offset} position={[offset, 1.3, 0.1]}>
          <cylinderGeometry args={[0.78, 0.96, 2.5, 16]} />
          <meshStandardMaterial color="#142a41" emissive={accent} emissiveIntensity={active ? 0.52 : 0.24} roughness={0.34} metalness={0.58} />
          <Edges color={accent} />
        </mesh>
      ))}
      <mesh position={[0, 2.6, -1.2]}>
        <boxGeometry args={[5.8, 0.16, 0.36]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.74} />
      </mesh>
      <mesh position={[0, 1.05, 1.55]}>
        <boxGeometry args={[4.2, 1.4, 1.5]} />
        <meshStandardMaterial color="#17354d" emissive={accent} emissiveIntensity={0.18} />
      </mesh>
      <group position={[0, 1.3, 0]}>
        <ZoneHitBox size={[7.2, 4.3, 5.9]} onSelect={onSelect} onHover={setHovered} />
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
  useCursor(hovered)
  useZoneMotion(rootRef, device.position[1], active, hovered)

  return (
    <group ref={rootRef} position={device.position}>
      <SelectionPulse radius={3.7} color={accent} active={active || hovered} warning={detail.status === 'warning'} />
      <mesh position={[0, 1.25, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.15, 1.15, 4.5, 18]} />
        <meshStandardMaterial color="#142a40" emissive={accent} emissiveIntensity={active ? 0.58 : 0.2} roughness={0.38} metalness={0.64} />
        <Edges color={accent} />
      </mesh>
      <mesh position={[2.3, 1.9, -0.2]}>
        <cylinderGeometry args={[0.36, 0.55, 2.7, 12]} />
        <meshStandardMaterial color="#1a3047" emissive={TWIN_COLORS.storageSoft} emissiveIntensity={0.34} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[5.6, 0.34, 3.2]} />
        <meshStandardMaterial color="#102233" emissive={accent} emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[-1.4, 1.1, 1.25]}>
        <boxGeometry args={[1.8, 1.8, 1.4]} />
        <meshStandardMaterial color="#173149" emissive={accent} emissiveIntensity={0.18} />
      </mesh>
      <group position={[0, 1.25, 0]}>
        <ZoneHitBox size={[6.3, 4.2, 4.2]} onSelect={onSelect} onHover={setHovered} />
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
      <SelectionPulse radius={4.2} color={accent} active={active || hovered} warning={detail.status === 'warning'} />
      {[-1.35, 1.35].map((offset) => (
        <group key={offset} position={[offset, 1.8, 0]}>
          <mesh>
            <cylinderGeometry args={[1.02, 1.02, 3.8, 18]} />
            <meshStandardMaterial color="#12283d" emissive={accent} emissiveIntensity={active ? 0.5 : 0.2} roughness={0.36} metalness={0.58} />
            <Edges color={accent} />
          </mesh>
          <mesh position={[0, 0, 1.02]}>
            <boxGeometry args={[0.15, 2.7, 0.08]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.95} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 4.05, 0]}>
        <boxGeometry args={[3.2, 0.14, 0.24]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.52} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <boxGeometry args={[4.3, 0.28, 3.4]} />
        <meshStandardMaterial color="#102130" emissive={accent} emissiveIntensity={0.18} />
      </mesh>
      <group position={[0, 1.8, 0]}>
        <ZoneHitBox size={[5.2, 5.2, 4.4]} onSelect={onSelect} onHover={setHovered} />
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
      <group position={[0, 1.2, 0]}>
        <ZoneHitBox size={[18.8, 4.2, 11.6]} onSelect={onSelect} onHover={setHovered} />
      </group>
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
      <Instances limit={cabinetSlots.length}>
        <boxGeometry args={[1.15, 2.4, 1.32]} />
        <meshStandardMaterial color="#13263a" emissive={accent} emissiveIntensity={active ? 0.48 : 0.16} roughness={0.52} metalness={0.46} />
        {cabinetSlots.map((cabinet, index) => (
          <Instance key={index} position={[cabinet.x, 1.34, cabinet.z]} />
        ))}
      </Instances>
      {cabinetSlots.map((cabinet, index) => (
        <group key={index} position={[cabinet.x, 1.34, cabinet.z]}>
          <mesh position={[0, 0, 0.69]}>
            <boxGeometry args={[0.74, 1.6, 0.05]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.86} />
          </mesh>
          <mesh position={[0, 1.26, 0]}>
            <boxGeometry args={[0.78, 0.14, 0.08]} />
            <meshStandardMaterial color={TWIN_COLORS.storage} emissive={TWIN_COLORS.storage} emissiveIntensity={0.78} />
          </mesh>
        </group>
      ))}
      <group position={[0, 1.34, 0]}>
        <ZoneHitBox size={[8.8, 4.4, 5.5]} onSelect={onSelect} onHover={setHovered} />
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
