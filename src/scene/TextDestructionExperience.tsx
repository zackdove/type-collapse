import { OrbitControls } from '@react-three/drei'
import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
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
import { CinematicMotionBlur } from './effects/CinematicMotionBlur'

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
    noiseAmplitude: { value: 1.6, min: 0, max: 4, step: 0.01 },
    noiseFrequency: { value: 0.5, min: 0.05, max: 4, step: 0.01 },
    noiseSpeed: { value: 1.0, min: 0, max: 5, step: 0.01 },
    followRate: { value: 18, min: 1, max: 50, step: 0.1 },
    radius: { value: 0.5, min: 0.05, max: 3, step: 0.01 },
    explodeAmplitude: { value: 1.5, min: 0, max: 5, step: 0.01 },
    rotationAmplitude: { value: 1.0, min: 0, max: 5, step: 0.01 },
    spring: { value: 0.05, min: 0.001, max: 0.2, step: 0.001 },
    friction: { value: 0.9, min: 0.5, max: 0.999, step: 0.001 },
    idleMix: { value: 0.0, min: 0, max: 0.5, step: 0.001 },
    color: '#f0f5ff',
    emissive: '#0b55c7',
    emissiveIntensity: { value: 0.75, min: 0, max: 3, step: 0.01 },
    emissiveVelocityBoost: { value: 5.0, min: 0, max: 20, step: 0.1 },
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
    dofEnabled: false,
    dofAutoFocusText: true,
    dofFocusDistance: { value: 9, min: 0.1, max: 40, step: 0.01 },
    dofFocusRange: { value: 2, min: 0.05, max: 20, step: 0.01 },
    dofBokehScale: { value: 1.25, min: 0, max: 8, step: 0.01 },
    dofResolutionScale: { value: 0.75, min: 0.1, max: 1, step: 0.01 },
    motionBlurEnabled: false,
    motionBlurStrength: { value: 0.0015, min: 0, max: 0.01, step: 0.0001 },
    motionBlurDirectionX: { value: 1.0, min: -2, max: 2, step: 0.01 },
    motionBlurDirectionY: { value: 0.35, min: -2, max: 2, step: 0.01 },
    motionBlurSamples: { value: 8, min: 2, max: 24, step: 1 },
    motionBlurOpacity: { value: 0.3, min: 0, max: 1, step: 0.01 },
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
      noiseAmplitude: distortionControls.noiseAmplitude,
      noiseFrequency: distortionControls.noiseFrequency,
      noiseSpeed: distortionControls.noiseSpeed,
      followRate: distortionControls.followRate,
      radius: distortionControls.radius,
      explodeAmplitude: distortionControls.explodeAmplitude,
      rotationAmplitude: distortionControls.rotationAmplitude,
      spring: distortionControls.spring,
      friction: distortionControls.friction,
      idleMix: distortionControls.idleMix,
      color: distortionControls.color,
      emissive: distortionControls.emissive,
      emissiveIntensity: distortionControls.emissiveIntensity,
      emissiveVelocityBoost: distortionControls.emissiveVelocityBoost,
      roughness: distortionControls.roughness,
      metalness: distortionControls.metalness,
      wireframe: distortionControls.wireframe,
    }),
    [
      distortionControls.emissiveVelocityBoost,
      distortionControls.color,
      distortionControls.explodeAmplitude,
      distortionControls.emissive,
      distortionControls.emissiveIntensity,
      distortionControls.friction,
      distortionControls.followRate,
      distortionControls.idleMix,
      distortionControls.metalness,
      distortionControls.noiseAmplitude,
      distortionControls.noiseFrequency,
      distortionControls.noiseSpeed,
      distortionControls.radius,
      distortionControls.rotationAmplitude,
      distortionControls.roughness,
      distortionControls.spring,
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

    if (postFxControls.dofEnabled) {
      children.push(
        <DepthOfField
          key="dof"
          target={postFxControls.dofAutoFocusText ? [0, 0, 0] : undefined}
          focusDistance={postFxControls.dofFocusDistance}
          focusRange={postFxControls.dofFocusRange}
          bokehScale={postFxControls.dofBokehScale}
          resolutionScale={postFxControls.dofResolutionScale}
        />,
      )
    }

    if (postFxControls.motionBlurEnabled) {
      children.push(
        <CinematicMotionBlur
          key="motion-blur"
          strength={postFxControls.motionBlurStrength}
          direction={[
            postFxControls.motionBlurDirectionX,
            postFxControls.motionBlurDirectionY,
          ]}
          samples={postFxControls.motionBlurSamples}
          opacity={postFxControls.motionBlurOpacity}
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
    postFxControls.dofAutoFocusText,
    postFxControls.dofBokehScale,
    postFxControls.dofEnabled,
    postFxControls.dofFocusDistance,
    postFxControls.dofFocusRange,
    postFxControls.dofResolutionScale,
    postFxControls.motionBlurDirectionX,
    postFxControls.motionBlurDirectionY,
    postFxControls.motionBlurEnabled,
    postFxControls.motionBlurOpacity,
    postFxControls.motionBlurSamples,
    postFxControls.motionBlurStrength,
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
