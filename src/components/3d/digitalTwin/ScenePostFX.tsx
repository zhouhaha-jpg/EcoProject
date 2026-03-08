import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { HalfFloatType, NoToneMapping } from 'three'
import { BloomEffect, EffectComposer, EffectPass, NoiseEffect, RenderPass, VignetteEffect } from 'postprocessing'

export default function ScenePostFX() {
  const { gl, scene, camera, size } = useThree()

  const composer = useMemo(() => {
    const effectComposer = new EffectComposer(gl, {
      multisampling: 0,
      frameBufferType: HalfFloatType,
    })
    const renderPass = new RenderPass(scene, camera)
    const effectPass = new EffectPass(
      camera,
      new BloomEffect({
        intensity: 1.05,
        luminanceThreshold: 0.16,
        luminanceSmoothing: 0.24,
      }),
      new NoiseEffect({
        premultiply: true,
      }),
      new VignetteEffect({
        eskil: false,
        offset: 0.15,
        darkness: 0.72,
      })
    )

    effectComposer.addPass(renderPass)
    effectComposer.addPass(effectPass)

    return effectComposer
  }, [camera, gl, scene])

  useEffect(() => {
    composer.setSize(size.width, size.height)
  }, [composer, size.height, size.width])

  useEffect(() => {
    const previousToneMapping = gl.toneMapping
    gl.toneMapping = NoToneMapping

    return () => {
      gl.toneMapping = previousToneMapping
      composer.dispose()
    }
  }, [composer, gl])

  useFrame((_, delta) => {
    composer.render(delta)
  }, 1)

  return null
}
