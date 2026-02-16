import { Center, Text3D } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { createNoise3D } from 'simplex-noise'
import gsap from 'gsap'
import { useCallback, useEffect, useRef } from 'react'
import type { BufferGeometry, Mesh, MeshStandardMaterial } from 'three'
import { BufferAttribute, Color, Euler, Vector3 } from 'three'

export type DistortionSettings = {
  noiseAmplitude: number
  noiseFrequency: number
  noiseSpeed: number
  followRate: number
  radius: number
  explodeAmplitude: number
  rotationAmplitude: number
  spring: number
  friction: number
  idleMix: number
  emissiveVelocityBoost: number
  color: string
  emissive: string
  emissiveIntensity: number
  roughness: number
  metalness: number
  wireframe: boolean
}

type ElasticTextProps = {
  text: string
  font: string
  size: number
  depth: number
  bevelEnabled: boolean
  bevelSize: number
  bevelThickness: number
  curveSegments: number
  paused: boolean
  seed: number
  meshKey: string
  distortion: DistortionSettings
  onTogglePause: () => void
}

type SimulationState = {
  geometry: BufferGeometry
  positionArray: Float32Array
  basePositionArray: Float32Array
  baseNormalArray: Float32Array
  velocityArray: Float32Array
  velocityAttribute: BufferAttribute
}

type EmissiveShader = {
  uniforms: {
    uEmissiveBaseColor: { value: Color }
    uEmissiveBoost: { value: number }
    uEmissiveIntensity: { value: number }
  }
  vertexShader: string
  fragmentShader: string
}

export function ElasticText({
  text,
  font,
  size,
  depth,
  bevelEnabled,
  bevelSize,
  bevelThickness,
  curveSegments,
  paused,
  seed,
  meshKey,
  distortion,
  onTogglePause,
}: ElasticTextProps) {
  const meshRef = useRef<Mesh>(null)
  const materialRef = useRef<MeshStandardMaterial>(null)
  const shaderRef = useRef<EmissiveShader | null>(null)
  const simulationRef = useRef<SimulationState | null>(null)

  const timeRef = useRef(0)
  const noise3dRef = useRef(createNoise3D())

  const pointerCurrentRef = useRef(new Vector3())
  const pointerTargetRef = useRef(new Vector3())
  const pointerPressRef = useRef({ value: 0 })
  const pauseBlendRef = useRef({ value: paused ? 1 : 0 })

  const scratchVectorRef = useRef(new Vector3())
  const scratchEulerRef = useRef(new Euler())

  const initializeSimulation = useCallback(() => {
    const mesh = meshRef.current
    if (!mesh) {
      simulationRef.current = null
      return
    }

    const geometry = mesh.geometry
    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')

    if (!position || !normal) {
      simulationRef.current = null
      return
    }

    const positionArray = position.array as Float32Array

    const velocityArray = new Float32Array(positionArray.length)
    const velocityAttribute = new BufferAttribute(velocityArray, 3)
    geometry.setAttribute('aVelocity', velocityAttribute)

    simulationRef.current = {
      geometry,
      positionArray,
      basePositionArray: new Float32Array(positionArray),
      baseNormalArray: new Float32Array(normal.array as Float32Array),
      velocityArray,
      velocityAttribute,
    }

    pointerCurrentRef.current.set(0, 0, 0)
    pointerTargetRef.current.set(0, 0, 0)
    pointerPressRef.current.value = 0
  }, [])

  const engagePointer = useCallback(() => {
    gsap.killTweensOf(pointerPressRef.current)
    gsap.to(pointerPressRef.current, {
      value: 1,
      duration: 0.08,
      ease: 'power2.out',
      overwrite: true,
    })
  }, [])

  const releasePointer = useCallback(() => {
    gsap.killTweensOf(pointerPressRef.current)
    gsap.to(pointerPressRef.current, {
      value: 0,
      duration: 0.35,
      ease: 'expo.out',
      overwrite: true,
    })
  }, [])

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (paused || !meshRef.current) {
        return
      }

      const localPoint = meshRef.current.worldToLocal(event.point.clone())
      pointerTargetRef.current.copy(localPoint)
      engagePointer()
    },
    [engagePointer, paused],
  )

  const handlePointerOut = useCallback(() => {
    releasePointer()
  }, [releasePointer])

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation()
      onTogglePause()
    },
    [onTogglePause],
  )

  useEffect(() => {
    initializeSimulation()
  }, [initializeSimulation, meshKey])

  useEffect(() => {
    gsap.to(pauseBlendRef.current, {
      value: paused ? 1 : 0,
      duration: 0.25,
      ease: 'power2.out',
      overwrite: true,
    })

    if (paused) {
      releasePointer()
    }
  }, [paused, releasePointer])

  useEffect(() => {
    const pointerPressState = pointerPressRef.current
    const pauseBlendState = pauseBlendRef.current

    return () => {
      gsap.killTweensOf(pointerPressState)
      gsap.killTweensOf(pauseBlendState)
    }
  }, [])

  useFrame((_, delta) => {
    const simulation = simulationRef.current
    if (!simulation) {
      return
    }

    if (!paused) {
      timeRef.current += delta
    }

    const followAlpha = 1 - Math.exp(-delta * distortion.followRate)
    pointerCurrentRef.current.lerp(pointerTargetRef.current, followAlpha)

    const pauseBlend = pauseBlendRef.current.value
    const press = pointerPressRef.current.value * (1 - pauseBlend)
    const idleMix = distortion.idleMix * (1 - pauseBlend)
    const mixFactor = Math.max(press, idleMix)

    const pointer = pointerCurrentRef.current
    const positionArray = simulation.positionArray
    const basePositionArray = simulation.basePositionArray
    const baseNormalArray = simulation.baseNormalArray
    const velocityArray = simulation.velocityArray

    const noise3d = noise3dRef.current
    const frequency = distortion.noiseFrequency
    const t = timeRef.current * distortion.noiseSpeed + seed * 0.001
    const radius = Math.max(distortion.radius, 0.0001)

    const scratchVector = scratchVectorRef.current
    const scratchEuler = scratchEulerRef.current

    for (let i = 0; i < positionArray.length; i += 3) {
      const baseX = basePositionArray[i]
      const baseY = basePositionArray[i + 1]
      const baseZ = basePositionArray[i + 2]

      const currentX = positionArray[i]
      const currentY = positionArray[i + 1]
      const currentZ = positionArray[i + 2]

      const normalX = baseNormalArray[i]
      const normalY = baseNormalArray[i + 1]
      const normalZ = baseNormalArray[i + 2]

      const dx = baseX - pointer.x
      const dy = baseY - pointer.y
      const dz = baseZ - pointer.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

      const pointerInfluence = distance <= radius ? distortion.explodeAmplitude : 0

      const noiseX = noise3d(currentX * frequency + seed * 0.17, currentY * frequency + t, currentZ * frequency)
      const noiseY = noise3d(currentX * frequency, currentY * frequency + 23.713 + t, currentZ * frequency + seed * 0.31)
      const noiseZ = noise3d(currentX * frequency + seed * 0.59, currentY * frequency + t, currentZ * frequency + 51.219)

      let distortedX = baseX + noiseX * normalX * pointerInfluence * distortion.noiseAmplitude
      let distortedY = baseY + noiseY * normalY * pointerInfluence * distortion.noiseAmplitude
      let distortedZ = baseZ + noiseZ * normalZ * pointerInfluence * distortion.noiseAmplitude

      if (pointerInfluence > 0) {
        const rotationFactor = distance * pointerInfluence * distortion.rotationAmplitude

        scratchEuler.set(
          normalX * rotationFactor,
          normalY * rotationFactor,
          normalZ * rotationFactor,
        )

        scratchVector.set(distortedX, distortedY, distortedZ).applyEuler(scratchEuler)
        distortedX = scratchVector.x
        distortedY = scratchVector.y
        distortedZ = scratchVector.z
      }

      const targetX = baseX + (distortedX - baseX) * mixFactor
      const targetY = baseY + (distortedY - baseY) * mixFactor
      const targetZ = baseZ + (distortedZ - baseZ) * mixFactor

      let velocityX = velocityArray[i]
      let velocityY = velocityArray[i + 1]
      let velocityZ = velocityArray[i + 2]

      velocityX += (targetX - currentX) * distortion.spring
      velocityY += (targetY - currentY) * distortion.spring
      velocityZ += (targetZ - currentZ) * distortion.spring

      const nextX = currentX + velocityX
      const nextY = currentY + velocityY
      const nextZ = currentZ + velocityZ

      velocityX *= distortion.friction
      velocityY *= distortion.friction
      velocityZ *= distortion.friction

      positionArray[i] = nextX
      positionArray[i + 1] = nextY
      positionArray[i + 2] = nextZ

      velocityArray[i] = velocityX
      velocityArray[i + 1] = velocityY
      velocityArray[i + 2] = velocityZ

    }

    simulation.geometry.attributes.position.needsUpdate = true

    simulation.velocityAttribute.needsUpdate = true

    const shader = shaderRef.current
    if (shader) {
      shader.uniforms.uEmissiveBaseColor.value.set(distortion.emissive)
      shader.uniforms.uEmissiveBoost.value = distortion.emissiveVelocityBoost
      shader.uniforms.uEmissiveIntensity.value = distortion.emissiveIntensity
    }
  })

  return (
    <group rotation={[-0.15, 0, 0]}>
      <Center>
        <Text3D
          key={meshKey}
          ref={meshRef}
          font={font}
          size={size}
          height={depth}
          bevelEnabled={bevelEnabled}
          bevelSize={bevelSize}
          bevelThickness={bevelThickness}
          curveSegments={curveSegments}
          onPointerMove={handlePointerMove}
          onPointerOut={handlePointerOut}
          onPointerUp={handlePointerOut}
          onClick={handleClick}
        >
          {text}
          <meshStandardMaterial
            ref={materialRef}
            color={distortion.color}
            emissive={distortion.emissive}
            emissiveIntensity={distortion.emissiveIntensity}
            roughness={distortion.roughness}
            metalness={distortion.metalness}
            wireframe={distortion.wireframe}
            customProgramCacheKey={() => 'elastic-emissive-velocity-v1'}
            onBeforeCompile={(shader: EmissiveShader) => {
              shader.uniforms.uEmissiveBaseColor = {
                value: new Color(distortion.emissive),
              }
              shader.uniforms.uEmissiveBoost = {
                value: distortion.emissiveVelocityBoost,
              }
              shader.uniforms.uEmissiveIntensity = {
                value: distortion.emissiveIntensity,
              }

              shader.vertexShader = shader.vertexShader
                .replace(
                  '#include <common>',
                  `#include <common>
attribute vec3 aVelocity;
varying vec3 vVelocity;`,
                )
                .replace(
                  '#include <begin_vertex>',
                  `#include <begin_vertex>
vVelocity = aVelocity;`,
                )

              shader.fragmentShader = shader.fragmentShader
                .replace(
                  '#include <common>',
                  `#include <common>
uniform vec3 uEmissiveBaseColor;
uniform float uEmissiveBoost;
uniform float uEmissiveIntensity;
varying vec3 vVelocity;

vec3 tslHue(vec3 baseColor, vec3 adjustment) {
  vec3 k = vec3(0.57735, 0.57735, 0.57735);
  vec3 cosAngle = cos(adjustment);
  return (baseColor * cosAngle) +
    (cross(k, baseColor) * sin(adjustment)) +
    (k * (dot(k, baseColor) * (vec3(1.0) - cosAngle)));
}`,
                )
                .replace(
                  'vec3 totalEmissiveRadiance = emissive;',
                  `vec3 hueRotated = vVelocity * (3.14159265 * 10.0);
float emissionFactor = length(vVelocity) * 10.0;
vec3 shiftedEmissive = tslHue(uEmissiveBaseColor, hueRotated) * emissionFactor * uEmissiveBoost * uEmissiveIntensity;
vec3 totalEmissiveRadiance = shiftedEmissive;`,
                )

              shaderRef.current = shader
            }}
          />
        </Text3D>
      </Center>
    </group>
  )
}
