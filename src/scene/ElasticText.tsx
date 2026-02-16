import { Text3D } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { createNoise3D } from 'simplex-noise'
import gsap from 'gsap'
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
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

export type DistortionAutomationMode = 'Off' | 'Sweep' | 'BPM Buzz'

export type DistortionAutomationSettings = {
  enabled: boolean
  mode: DistortionAutomationMode
  intensity: number
  pointerZOffset: number
  sweepCycleSeconds: number
  sweepWidth: number
  sweepCurve: number
  sweepBob: number
  sweepBobFrequency: number
  sweepDepth: number
  bpm: number
  stepsPerBeat: number
  buzzFraction: number
  buzzAttack: number
  buzzRelease: number
  spreadX: number
  spreadY: number
  centerBias: number
  travelPortion: number
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
  automation: DistortionAutomationSettings
  distortionOverrideRef?: MutableRefObject<Partial<DistortionSettings> | null>
  onTogglePause: () => void
}

type TextBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

type BpmAutomationState = {
  stepIndex: number
  from: Vector3
  to: Vector3
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function easeInOutSine(value: number): number {
  return -(Math.cos(Math.PI * value) - 1) * 0.5
}

function hashToUnit(value: number): number {
  const hashed = Math.sin(value * 12.9898 + 78.233) * 43758.5453123
  return hashed - Math.floor(hashed)
}

function randomSignedWithBiasFromUnit(unit: number, centerBias: number): number {
  const random = unit * 2 - 1
  const exponent = 1 + clamp(centerBias, 0, 1) * 2.5
  return Math.sign(random) * Math.pow(Math.abs(random), exponent)
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
  automation,
  distortionOverrideRef,
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
  const manualPointerTargetRef = useRef(new Vector3())
  const pointerPressRef = useRef({ value: 0 })
  const automationPointerTargetRef = useRef(new Vector3())
  const automationPointerPressRef = useRef({ value: 0 })
  const pointerBlendRef = useRef(new Vector3())
  const boundsRef = useRef<TextBounds>({
    minX: -1,
    maxX: 1,
    minY: -1,
    maxY: 1,
    minZ: -0.5,
    maxZ: 0.5,
  })
  const bpmAutomationRef = useRef<BpmAutomationState>({
    stepIndex: -1,
    from: new Vector3(),
    to: new Vector3(),
  })

  const scratchVectorRef = useRef(new Vector3())
  const scratchEulerRef = useRef(new Euler())

  const initializeSimulation = useCallback(() => {
    const mesh = meshRef.current
    if (!mesh) {
      simulationRef.current = null
      return
    }

    const geometry = mesh.geometry
    geometry.computeBoundingBox()
    geometry.center()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()

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

    const bounds = geometry.boundingBox
    if (bounds) {
      boundsRef.current = {
        minX: bounds.min.x,
        maxX: bounds.max.x,
        minY: bounds.min.y,
        maxY: bounds.max.y,
        minZ: bounds.min.z,
        maxZ: bounds.max.z,
      }
    }

    const centerX = (boundsRef.current.minX + boundsRef.current.maxX) * 0.5
    const centerY = (boundsRef.current.minY + boundsRef.current.maxY) * 0.5
    const centerZ = (boundsRef.current.minZ + boundsRef.current.maxZ) * 0.5

    pointerCurrentRef.current.set(centerX, centerY, centerZ)
    pointerTargetRef.current.set(centerX, centerY, centerZ)
    manualPointerTargetRef.current.set(centerX, centerY, centerZ)
    automationPointerTargetRef.current.set(centerX, centerY, centerZ)
    pointerPressRef.current.value = 0
    automationPointerPressRef.current.value = 0
    bpmAutomationRef.current.stepIndex = -1
    bpmAutomationRef.current.from.set(centerX, centerY, centerZ)
    bpmAutomationRef.current.to.set(centerX, centerY, centerZ)
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
      manualPointerTargetRef.current.copy(localPoint)
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
    const manualPointerPressState = pointerPressRef.current

    return () => {
      gsap.killTweensOf(manualPointerPressState)
    }
  }, [])

  useEffect(() => {
    bpmAutomationRef.current.stepIndex = -1
  }, [automation.mode, automation.bpm, automation.stepsPerBeat])

  useFrame((_, delta) => {
    const simulation = simulationRef.current
    if (!simulation) {
      return
    }

    const distortionOverride = distortionOverrideRef?.current
    const activeDistortion = distortionOverride
      ? { ...distortion, ...distortionOverride }
      : distortion

    const shader = shaderRef.current
    if (shader) {
      shader.uniforms.uEmissiveBaseColor.value.set(activeDistortion.emissive)
      shader.uniforms.uEmissiveBoost.value = activeDistortion.emissiveVelocityBoost
      shader.uniforms.uEmissiveIntensity.value = activeDistortion.emissiveIntensity
    }

    if (paused) {
      return
    }

    timeRef.current += delta

    const bounds = boundsRef.current
    const width = Math.max(bounds.maxX - bounds.minX, 0.001)
    const height = Math.max(bounds.maxY - bounds.minY, 0.001)
    const depthSpan = Math.max(bounds.maxZ - bounds.minZ, 0.001)
    const halfWidth = width * 0.5
    const halfHeight = height * 0.5
    const halfDepth = depthSpan * 0.5
    const centerX = (bounds.maxX + bounds.minX) * 0.5
    const centerY = (bounds.maxY + bounds.minY) * 0.5
    const centerZ = (bounds.maxZ + bounds.minZ) * 0.5

    const automationTarget = automationPointerTargetRef.current
    const automationPressState = automationPointerPressRef.current
    automationPressState.value = 0

    if (automation.enabled && automation.mode !== 'Off') {
      if (automation.mode === 'Sweep') {
        const cycleSeconds = Math.max(automation.sweepCycleSeconds, 0.1)
        const phase = (timeRef.current / cycleSeconds) * Math.PI * 2
        const xNorm = Math.sin(phase)
        const xTravel = halfWidth * clamp(automation.sweepWidth, 0.05, 1.3)
        const curveLift = (1 - xNorm * xNorm) * automation.sweepCurve * halfHeight
        const bob = Math.sin(phase * Math.max(automation.sweepBobFrequency, 0.01)) * automation.sweepBob * halfHeight
        const zOscillation = Math.cos(phase * 1.65) * automation.sweepDepth * (halfDepth + 0.25)

        const targetX = centerX + xNorm * xTravel
        const targetY = centerY + curveLift + bob
        const targetZ = centerZ + zOscillation + automation.pointerZOffset

        const yLimit = halfHeight * 1.35
        automationTarget.set(
          clamp(targetX, centerX - xTravel, centerX + xTravel),
          clamp(targetY, centerY - yLimit, centerY + yLimit),
          targetZ,
        )
        automationPressState.value = clamp(automation.intensity, 0, 1)
      } else if (automation.mode === 'BPM Buzz') {
        const bpm = Math.max(automation.bpm, 1)
        const stepsPerBeat = Math.max(1, automation.stepsPerBeat)
        const stepDuration = 60 / (bpm * stepsPerBeat)
        const stepPosition = timeRef.current / stepDuration
        const stepIndex = Math.floor(stepPosition)
        const stepProgress = stepPosition - stepIndex

        const bpmState = bpmAutomationRef.current
        if (stepIndex !== bpmState.stepIndex) {
          bpmState.stepIndex = stepIndex
          bpmState.from.copy(automationTarget)

          const spreadX = clamp(automation.spreadX, 0.05, 1.3)
          const spreadY = clamp(automation.spreadY, 0.05, 1.3)
          const randomSeedBase = seed * 0.173 + stepIndex * 1.4142
          const xNorm = randomSignedWithBiasFromUnit(
            hashToUnit(randomSeedBase + 13.11),
            automation.centerBias,
          )
          const yNorm = randomSignedWithBiasFromUnit(
            hashToUnit(randomSeedBase + 31.77),
            automation.centerBias,
          )
          const zNorm = randomSignedWithBiasFromUnit(
            hashToUnit(randomSeedBase + 57.43),
            Math.min(1, automation.centerBias + 0.25),
          )
          const xRange = halfWidth * spreadX
          const yRange = halfHeight * spreadY
          const zRange = halfDepth * 0.35 + 0.12

          bpmState.to.set(
            centerX + xNorm * xRange,
            centerY + yNorm * yRange,
            centerZ + zNorm * zRange + automation.pointerZOffset,
          )
        }

        const travelPortion = clamp(automation.travelPortion, 0.01, 1)
        const moveAlpha = clamp(stepProgress / travelPortion, 0, 1)
        automationTarget.lerpVectors(
          bpmState.from,
          bpmState.to,
          easeInOutSine(moveAlpha),
        )

        const buzzFraction = clamp(automation.buzzFraction, 0.02, 1)
        if (stepProgress <= buzzFraction) {
          const buzzProgress = stepProgress / buzzFraction
          const attack = clamp(automation.buzzAttack, 0.01, 0.49)
          const release = clamp(automation.buzzRelease, 0.01, 0.49)
          let envelope = 1

          if (buzzProgress < attack) {
            envelope = buzzProgress / attack
          } else if (buzzProgress > 1 - release) {
            envelope = (1 - buzzProgress) / release
          }

          automationPressState.value = clamp(
            envelope * automation.intensity,
            0,
            1,
          )
        }
      }
    }

    const manualPress = pointerPressRef.current.value
    const automationPress = automationPressState.value
    const totalPress = manualPress + automationPress

    if (totalPress > 0.0001) {
      pointerBlendRef.current
        .set(0, 0, 0)
        .addScaledVector(manualPointerTargetRef.current, manualPress)
        .addScaledVector(automationTarget, automationPress)
        .multiplyScalar(1 / totalPress)
      pointerTargetRef.current.copy(pointerBlendRef.current)
    }

    const followAlpha = 1 - Math.exp(-delta * activeDistortion.followRate)
    pointerCurrentRef.current.lerp(pointerTargetRef.current, followAlpha)

    const press = Math.max(manualPress, automationPress)
    const idleMix = activeDistortion.idleMix
    const mixFactor = Math.max(press, idleMix)

    const pointer = pointerCurrentRef.current
    const positionArray = simulation.positionArray
    const basePositionArray = simulation.basePositionArray
    const baseNormalArray = simulation.baseNormalArray
    const velocityArray = simulation.velocityArray

    const noise3d = noise3dRef.current
    const frequency = activeDistortion.noiseFrequency
    const t = timeRef.current * activeDistortion.noiseSpeed + seed * 0.001
    const radius = Math.max(activeDistortion.radius, 0.0001)

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

      const pointerInfluence = distance <= radius ? activeDistortion.explodeAmplitude : 0

      const noiseX = noise3d(currentX * frequency + seed * 0.17, currentY * frequency + t, currentZ * frequency)
      const noiseY = noise3d(currentX * frequency, currentY * frequency + 23.713 + t, currentZ * frequency + seed * 0.31)
      const noiseZ = noise3d(currentX * frequency + seed * 0.59, currentY * frequency + t, currentZ * frequency + 51.219)

      let distortedX = baseX + noiseX * normalX * pointerInfluence * activeDistortion.noiseAmplitude
      let distortedY = baseY + noiseY * normalY * pointerInfluence * activeDistortion.noiseAmplitude
      let distortedZ = baseZ + noiseZ * normalZ * pointerInfluence * activeDistortion.noiseAmplitude

      if (pointerInfluence > 0) {
        const rotationFactor = distance * pointerInfluence * activeDistortion.rotationAmplitude

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

      velocityX += (targetX - currentX) * activeDistortion.spring
      velocityY += (targetY - currentY) * activeDistortion.spring
      velocityZ += (targetZ - currentZ) * activeDistortion.spring

      const nextX = currentX + velocityX
      const nextY = currentY + velocityY
      const nextZ = currentZ + velocityZ

      velocityX *= activeDistortion.friction
      velocityY *= activeDistortion.friction
      velocityZ *= activeDistortion.friction

      positionArray[i] = nextX
      positionArray[i + 1] = nextY
      positionArray[i + 2] = nextZ

      velocityArray[i] = velocityX
      velocityArray[i + 1] = velocityY
      velocityArray[i + 2] = velocityZ

    }

    simulation.geometry.attributes.position.needsUpdate = true

    simulation.velocityAttribute.needsUpdate = true

  })

  return (
    <group rotation={[-0.15, 0, 0]}>
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
    </group>
  )
}
