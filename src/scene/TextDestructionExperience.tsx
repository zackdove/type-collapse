import { OrbitControls } from '@react-three/drei'
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  Vignette,
} from '@react-three/postprocessing'
import { button, useControls } from 'leva'
import { BlendFunction } from 'postprocessing'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { Vector2 } from 'three'

import { DEFAULT_FONT, DEFAULT_TEXT, FONT_OPTIONS } from '../data/fonts'
import { useScreenshotExport } from '../hooks/useScreenshotExport'
import { ElasticText, type DistortionSettings } from './ElasticText'

export function TextDestructionExperience() {
  const [paused, setPaused] = useState(false)
  const [seed, setSeed] = useState(() => Math.random() * 1000)
  const [manualRenderedText, setManualRenderedText] = useState(DEFAULT_TEXT)

  const draftTextRef = useRef(DEFAULT_TEXT)
  const exportScaleRef = useRef(2)
  const exportScreenshot = useScreenshotExport()

  const togglePause = useCallback(() => {
    setPaused((current) => !current)
  }, [])

  const randomizeSeed = useCallback(() => {
    setSeed(Math.random() * 1000)
  }, [])

  const regenerateText = useCallback(() => {
    const nextText = draftTextRef.current.trim().replace(/\s+/g, ' ')
    setManualRenderedText(nextText.length > 0 ? nextText : DEFAULT_TEXT)
  }, [])

  useControls(
    'Playback',
    () => ({
      pauseOrResume: button(() => togglePause()),
      randomizeSeed: button(() => randomizeSeed()),
    }),
    [togglePause, randomizeSeed],
  )

  const [textControls] = useControls(
    'Text',
    () => ({
      content: { value: DEFAULT_TEXT },
      autoRegen: true,
      font: { value: DEFAULT_FONT, options: FONT_OPTIONS },
      size: { value: 1.52, min: 0.3, max: 3.5, step: 0.01 },
      depth: { value: 0.32, min: 0.03, max: 1.2, step: 0.01 },
      bevelEnabled: true,
      bevelSize: { value: 0.02, min: 0, max: 0.08, step: 0.001 },
      bevelThickness: { value: 0.03, min: 0, max: 0.2, step: 0.001 },
      curveSegments: { value: 20, min: 4, max: 36, step: 1 },
      regen: button(() => regenerateText()),
    }),
    [regenerateText],
  )

  const distortionControls = useControls('Distortion', {
    amplitude: { value: 0.3, min: 0, max: 1.5, step: 0.01 },
    frequency: { value: 1.45, min: 0.1, max: 4, step: 0.01 },
    speed: { value: 1.18, min: 0, max: 4, step: 0.01 },
    followRate: { value: 12, min: 1, max: 40, step: 0.1 },
    impactRadius: { value: 1.15, min: 0.05, max: 3, step: 0.01 },
    impactFalloff: { value: 2.65, min: 0.5, max: 10, step: 0.01 },
    impactImpulse: { value: 1.0, min: 0, max: 3, step: 0.01 },
    color: '#f0f5ff',
    emissive: '#47b2ff',
    emissiveIntensity: { value: 0.75, min: 0, max: 3, step: 0.01 },
    roughness: { value: 0.24, min: 0, max: 1, step: 0.01 },
    metalness: { value: 0.2, min: 0, max: 1, step: 0.01 },
    wireframe: false,
  })

  const postFxControls = useControls('Post FX', {
    enabled: true,
    bloomEnabled: true,
    bloomIntensity: { value: 1.2, min: 0, max: 4, step: 0.01 },
    bloomThreshold: { value: 0.23, min: 0, max: 1, step: 0.01 },
    bloomSmoothing: { value: 0.68, min: 0, max: 1, step: 0.01 },
    chromaticEnabled: true,
    chromaticOffsetX: { value: 0.0012, min: 0, max: 0.01, step: 0.0001 },
    chromaticOffsetY: { value: 0.0012, min: 0, max: 0.01, step: 0.0001 },
    noiseEnabled: true,
    noiseOpacity: { value: 0.12, min: 0, max: 0.8, step: 0.01 },
    vignetteEnabled: true,
    vignetteOffset: { value: 0.26, min: 0, max: 1, step: 0.01 },
    vignetteDarkness: { value: 0.9, min: 0, max: 2, step: 0.01 },
  })

  useControls(
    'Export',
    () => ({
      resolution: {
        value: 2,
        options: { '1x': 1, '2x': 2, '3x': 3 },
        onChange: (value: number) => {
          exportScaleRef.current = value
        },
      },
      screenshot: button(() => {
        void exportScreenshot(exportScaleRef.current)
      }),
    }),
    [exportScreenshot],
  )

  const draftText = useMemo(
    () => textControls.content.trim().replace(/\s+/g, ' ') || DEFAULT_TEXT,
    [textControls.content],
  )

  useEffect(() => {
    draftTextRef.current = draftText
  }, [draftText])

  const distortion: DistortionSettings = useMemo(
    () => ({
      amplitude: distortionControls.amplitude,
      frequency: distortionControls.frequency,
      speed: distortionControls.speed,
      followRate: distortionControls.followRate,
      impactRadius: distortionControls.impactRadius,
      impactFalloff: distortionControls.impactFalloff,
      impactImpulse: distortionControls.impactImpulse,
      color: distortionControls.color,
      emissive: distortionControls.emissive,
      emissiveIntensity: distortionControls.emissiveIntensity,
      roughness: distortionControls.roughness,
      metalness: distortionControls.metalness,
      wireframe: distortionControls.wireframe,
    }),
    [
      distortionControls.amplitude,
      distortionControls.color,
      distortionControls.emissive,
      distortionControls.emissiveIntensity,
      distortionControls.followRate,
      distortionControls.frequency,
      distortionControls.impactFalloff,
      distortionControls.impactImpulse,
      distortionControls.impactRadius,
      distortionControls.metalness,
      distortionControls.roughness,
      distortionControls.speed,
      distortionControls.wireframe,
    ],
  )

  const renderedText = textControls.autoRegen ? draftText : manualRenderedText

  const chromaticOffset = useMemo(
    () => new Vector2(postFxControls.chromaticOffsetX, postFxControls.chromaticOffsetY),
    [postFxControls.chromaticOffsetX, postFxControls.chromaticOffsetY],
  )

  const postFxChildren = useMemo(() => {
    const children: ReactElement[] = []

    if (postFxControls.bloomEnabled) {
      children.push(
        <Bloom
          key="bloom"
          intensity={postFxControls.bloomIntensity}
          luminanceThreshold={postFxControls.bloomThreshold}
          luminanceSmoothing={postFxControls.bloomSmoothing}
          mipmapBlur
        />,
      )
    }

    if (postFxControls.chromaticEnabled) {
      children.push(<ChromaticAberration key="chromatic" offset={chromaticOffset} />)
    }

    if (postFxControls.noiseEnabled) {
      children.push(
        <Noise
          key="noise"
          blendFunction={BlendFunction.OVERLAY}
          opacity={postFxControls.noiseOpacity}
        />,
      )
    }

    if (postFxControls.vignetteEnabled) {
      children.push(
        <Vignette
          key="vignette"
          eskil={false}
          offset={postFxControls.vignetteOffset}
          darkness={postFxControls.vignetteDarkness}
        />,
      )
    }

    return children
  }, [
    chromaticOffset,
    postFxControls.bloomEnabled,
    postFxControls.bloomIntensity,
    postFxControls.bloomSmoothing,
    postFxControls.bloomThreshold,
    postFxControls.chromaticEnabled,
    postFxControls.noiseEnabled,
    postFxControls.noiseOpacity,
    postFxControls.vignetteDarkness,
    postFxControls.vignetteEnabled,
    postFxControls.vignetteOffset,
  ])

  const meshKey = useMemo(
    () => `${renderedText}:${textControls.font}:${textControls.curveSegments}:${textControls.bevelEnabled ? 1 : 0}`,
    [
      renderedText,
      textControls.bevelEnabled,
      textControls.curveSegments,
      textControls.font,
    ],
  )

  return (
    <>
      <ambientLight intensity={0.35} color="#d9edff" />
      <directionalLight position={[7, 8, 6]} intensity={2.2} color="#f4f8ff" />
      <pointLight position={[-8, -3, 2]} intensity={1.2} color="#3ea9ff" />

      <ElasticText
        text={renderedText}
        font={textControls.font}
        size={textControls.size}
        depth={textControls.depth}
        bevelEnabled={textControls.bevelEnabled}
        bevelSize={textControls.bevelSize}
        bevelThickness={textControls.bevelThickness}
        curveSegments={textControls.curveSegments}
        paused={paused}
        seed={seed}
        meshKey={meshKey}
        distortion={distortion}
        onTogglePause={togglePause}
      />

      <mesh position={[0, -2.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[90, 90]} />
        <meshStandardMaterial color="#070d14" roughness={0.95} metalness={0.05} />
      </mesh>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={3.5}
        maxDistance={20}
      />

      {postFxControls.enabled && (
        <EffectComposer enableNormalPass={false} multisampling={0}>
          {postFxChildren}
        </EffectComposer>
      )}
    </>
  )
}
