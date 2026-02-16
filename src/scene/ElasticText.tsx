import { Center, Text3D } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import gsap from 'gsap'
import { useCallback, useEffect, useRef } from 'react'
import type { Mesh } from 'three'
import { Vector3 } from 'three'

export type DistortionSettings = {
  amplitude: number
  frequency: number
  speed: number
  followRate: number
  impactRadius: number
  impactFalloff: number
  impactImpulse: number
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

type ElasticShader = {
  uniforms: {
    uTime: { value: number }
    uAmplitude: { value: number }
    uFrequency: { value: number }
    uSpeed: { value: number }
    uImpactRadius: { value: number }
    uImpactFalloff: { value: number }
    uImpactStrength: { value: number }
    uImpact: { value: Vector3 }
    uSeed: { value: number }
    uPause: { value: number }
  }
  vertexShader: string
}

const SIMPLEX_3D_GLSL = `
vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(
    permute(
      permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)
    ) + i.x + vec4(0.0, i1.x, i2.x, 1.0)
  );

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;

  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`

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
  const shaderRef = useRef<ElasticShader | null>(null)
  const timeRef = useRef(0)

  const currentImpactRef = useRef(new Vector3())
  const targetImpactRef = useRef(new Vector3())
  const impactStateRef = useRef({ strength: 0 })
  const pauseBlendRef = useRef({ value: paused ? 1 : 0 })

  const triggerImpact = useCallback(() => {
    gsap.killTweensOf(impactStateRef.current)
    gsap.to(impactStateRef.current, {
      strength: distortion.impactImpulse,
      duration: 0.13,
      ease: 'power3.out',
      overwrite: true,
      onComplete: () => {
        gsap.to(impactStateRef.current, {
          strength: 0,
          duration: 0.7,
          ease: 'expo.out',
          overwrite: true,
        })
      },
    })
  }, [distortion.impactImpulse])

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (paused || !meshRef.current) {
        return
      }

      const localPoint = meshRef.current.worldToLocal(event.point.clone())
      targetImpactRef.current.copy(localPoint)
      triggerImpact()
    },
    [paused, triggerImpact],
  )

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation()
      onTogglePause()
    },
    [onTogglePause],
  )

  useEffect(() => {
    gsap.to(pauseBlendRef.current, {
      value: paused ? 1 : 0,
      duration: 0.35,
      ease: 'power2.out',
      overwrite: true,
    })
  }, [paused])

  useEffect(() => {
    const impactState = impactStateRef.current
    const pauseBlend = pauseBlendRef.current

    return () => {
      gsap.killTweensOf(impactState)
      gsap.killTweensOf(pauseBlend)
    }
  }, [])

  useFrame((_, delta) => {
    const shader = shaderRef.current
    if (!shader) {
      return
    }

    if (!paused) {
      timeRef.current += delta
    }

    const followAlpha = 1 - Math.exp(-delta * distortion.followRate)
    currentImpactRef.current.lerp(targetImpactRef.current, followAlpha)

    shader.uniforms.uTime.value = timeRef.current
    shader.uniforms.uAmplitude.value = distortion.amplitude
    shader.uniforms.uFrequency.value = distortion.frequency
    shader.uniforms.uSpeed.value = distortion.speed
    shader.uniforms.uImpactRadius.value = distortion.impactRadius
    shader.uniforms.uImpactFalloff.value = distortion.impactFalloff
    shader.uniforms.uImpactStrength.value = impactStateRef.current.strength
    shader.uniforms.uImpact.value.copy(currentImpactRef.current)
    shader.uniforms.uSeed.value = seed
    shader.uniforms.uPause.value = pauseBlendRef.current.value
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
          onClick={handleClick}
        >
          {text}
          <meshStandardMaterial
            color={distortion.color}
            emissive={distortion.emissive}
            emissiveIntensity={distortion.emissiveIntensity}
            roughness={distortion.roughness}
            metalness={distortion.metalness}
            wireframe={distortion.wireframe}
            customProgramCacheKey={() => 'elastic-text-v1'}
            onBeforeCompile={(shader: ElasticShader) => {
              shader.uniforms.uTime = { value: 0 }
              shader.uniforms.uAmplitude = { value: distortion.amplitude }
              shader.uniforms.uFrequency = { value: distortion.frequency }
              shader.uniforms.uSpeed = { value: distortion.speed }
              shader.uniforms.uImpactRadius = { value: distortion.impactRadius }
              shader.uniforms.uImpactFalloff = { value: distortion.impactFalloff }
              shader.uniforms.uImpactStrength = { value: 0 }
              shader.uniforms.uImpact = { value: new Vector3() }
              shader.uniforms.uSeed = { value: seed }
              shader.uniforms.uPause = { value: pauseBlendRef.current.value }

              shader.vertexShader = shader.vertexShader
                .replace(
                  '#include <common>',
                  `#include <common>
uniform float uTime;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uSpeed;
uniform float uImpactRadius;
uniform float uImpactFalloff;
uniform float uImpactStrength;
uniform vec3 uImpact;
uniform float uSeed;
uniform float uPause;
${SIMPLEX_3D_GLSL}`,
                )
                .replace(
                  '#include <begin_vertex>',
                  `vec3 transformed = vec3(position);
float t = uTime * uSpeed + uSeed;
float coarseNoise = snoise(vec3(position * uFrequency + t));
float fineNoise = snoise(vec3(position * (uFrequency * 2.7) - t * 0.65));
float wave = sin((position.x + position.y * 1.4 + position.z * 0.75) * 3.2 + t * 2.2);
float glitch = ((coarseNoise * 0.65) + (fineNoise * 0.2) + (wave * 0.15)) * uAmplitude * (1.0 - uPause);
float d = distance(position, uImpact);
float impactFalloff = exp(-uImpactFalloff * d * d);
float impact = impactFalloff * uImpactStrength * uImpactRadius * (1.0 - uPause);
transformed += normal * (glitch + impact);`,
                )

              shaderRef.current = shader
            }}
          />
        </Text3D>
      </Center>
    </group>
  )
}
