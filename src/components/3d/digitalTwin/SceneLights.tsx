import { TWIN_COLORS } from './config'

export default function SceneLights() {
  return (
    <>
      <color attach="background" args={[TWIN_COLORS.background]} />
      <fog attach="fog" args={[TWIN_COLORS.background, 30, 70]} />
      <ambientLight intensity={0.44} />
      <hemisphereLight args={['#73dfff', '#071019', 0.72]} />
      <directionalLight position={[20, 26, 14]} intensity={1.55} color="#c7f3ff" />
      <directionalLight position={[-18, 12, -10]} intensity={0.52} color="#3fb5ff" />
      <pointLight position={[7, 8, 1]} intensity={1.35} distance={22} color={TWIN_COLORS.primary} />
      <pointLight position={[-18, 5, -7]} intensity={0.95} distance={18} color={TWIN_COLORS.energy} />
      <pointLight position={[18, 4, 10]} intensity={0.8} distance={16} color={TWIN_COLORS.storage} />
    </>
  )
}
