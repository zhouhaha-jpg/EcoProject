import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import type { Group } from 'three'
import { DATA_MARKERS, TWIN_COLORS } from './config'
import type { TwinSceneSnapshot } from './types'

function FloatingGroup({ position, speed = 1.1, children }: { position: [number, number, number]; speed?: number; children: ReactNode }) {
  const ref = useRef<Group>(null)

  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.position.y = position[1] + Math.sin(clock.getElapsedTime() * speed + position[0] * 0.15) * 0.08
  })

  return <group ref={ref} position={position}>{children}</group>
}

export default function LabelsAndMarkers({
  snapshot,
  activeDeviceId,
}: {
  snapshot: TwinSceneSnapshot
  activeDeviceId: string
}) {
  const activeBadge = snapshot.deviceBadges[activeDeviceId]

  return (
    <group>
      {Object.values(snapshot.deviceBadges).map((badge) => {
        const isActive = badge.id === activeDeviceId
        return (
          <FloatingGroup key={badge.id} position={badge.position} speed={isActive ? 1.6 : 1.05}>
            <Html center distanceFactor={isActive ? 10 : 13}>
              <div
                style={{
                  minWidth: isActive ? 164 : 112,
                  padding: isActive ? '10px 12px' : '6px 8px',
                  borderRadius: 12,
                  border: `1px solid ${isActive ? 'rgba(0,215,255,0.48)' : 'rgba(39,92,130,0.72)'}`,
                  background: isActive ? 'rgba(8,18,30,0.92)' : 'rgba(7,14,24,0.74)',
                  color: '#d9fdff',
                  boxShadow: isActive ? `0 0 26px ${badge.accent}22` : '0 0 14px rgba(0,215,255,0.08)',
                  backdropFilter: 'blur(8px)',
                  whiteSpace: 'nowrap',
                  transform: isActive ? 'translateY(-4px)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: isActive ? 6 : 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: badge.accent, boxShadow: `0 0 12px ${badge.accent}` }} />
                  <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: isActive ? 13 : 11, letterSpacing: 1 }}>{badge.title}</span>
                </div>
                <div style={{ color: isActive ? '#9adfff' : '#7ea6c7', fontSize: 10, marginBottom: 4 }}>{badge.subtitle}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ color: '#6e8fad', fontSize: 9 }}>{badge.metricLabel}</span>
                  <span style={{ color: badge.accent, fontFamily: "'Rajdhani', sans-serif", fontSize: isActive ? 15 : 12, fontWeight: 700 }}>{badge.metricValue}</span>
                </div>
                {isActive && badge.secondaryValue ? (
                  <div style={{ color: '#7ea6c7', fontSize: 10, marginTop: 5 }}>{badge.secondaryValue}</div>
                ) : null}
              </div>
            </Html>
          </FloatingGroup>
        )
      })}

      {snapshot.hudMetrics.slice(0, 3).map((metric, index) => {
        const markerPosition = DATA_MARKERS[index]?.position ?? [0, 0.1, 0]
        return (
          <group key={metric.id} position={markerPosition}>
            <mesh position={[0, 2.5, 0]}>
              <cylinderGeometry args={[0.06, 0.16, 5, 10]} />
              <meshStandardMaterial color={metric.accent} emissive={metric.accent} emissiveIntensity={0.9} transparent opacity={0.68} />
            </mesh>
            <Html position={[0, 5.8, 0]} center distanceFactor={14}>
              <div
                style={{
                  padding: '6px 9px',
                  borderRadius: 10,
                  border: '1px solid rgba(31,89,126,0.84)',
                  background: 'rgba(6,15,25,0.78)',
                  color: '#d9fdff',
                  boxShadow: '0 0 14px rgba(0,215,255,0.08)',
                  minWidth: 94,
                }}
              >
                <div style={{ color: '#7ea6c7', fontSize: 9 }}>{metric.label}</div>
                <div style={{ color: metric.accent, fontFamily: "'Rajdhani', sans-serif", fontSize: 14, fontWeight: 700, marginTop: 2 }}>{metric.value}</div>
              </div>
            </Html>
          </group>
        )
      })}

      {activeBadge ? (
        <Html position={[0, 8.4, -10.5]} center distanceFactor={11}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid rgba(28,73,103,0.92)',
              background: 'rgba(6,14,24,0.82)',
              color: TWIN_COLORS.text,
              boxShadow: '0 0 16px rgba(0,215,255,0.08)',
            }}
          >
            <span style={{ color: '#7ea6c7', fontSize: 10 }}>ACTIVE NODE</span>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: activeBadge.accent, boxShadow: `0 0 10px ${activeBadge.accent}` }} />
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, letterSpacing: 1 }}>{activeBadge.title}</span>
            <span style={{ color: '#7ea6c7', fontSize: 10 }}>{activeBadge.metricValue}</span>
          </div>
        </Html>
      ) : null}
    </group>
  )
}
