import { OrbitControls } from "@react-three/drei";
import {
  Bloom,
  ChromaticAberration,
  ColorDepth,
  DepthOfField,
  EffectComposer,
  Glitch,
  Noise,
  Pixelation,
  Scanline,
  Vignette,
} from "@react-three/postprocessing";
import { button, useControls } from "leva";
import gsap from "gsap";
import { BlendFunction, GlitchMode } from "postprocessing";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { PerspectiveCamera, Quaternion, Vector2, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { DEFAULT_FONT, DEFAULT_TEXT, FONT_OPTIONS } from "../data/fonts";
import { useScreenshotExport } from "../hooks/useScreenshotExport";
import {
  ElasticText,
  type DistortionAutomationMode,
  type DistortionAutomationSettings,
  type DistortionCharacterMode,
  type DistortionSettings,
} from "./ElasticText";
import { BrutalistCompositeFx } from "./effects/BrutalistCompositeFx";
import { CinematicMotionBlur } from "./effects/CinematicMotionBlur";
import { TemporalFeedbackTrail } from "./effects/TemporalFeedbackTrail";

type TimelineSnapshot = {
  cameraPosition: Vector3;
  cameraTarget: Vector3;
  cameraFov: number;
  distortion: {
    noiseAmplitude: number;
    explodeAmplitude: number;
    rotationAmplitude: number;
    spring: number;
    friction: number;
    emissiveVelocityBoost: number;
  };
  postFx: {
    bloomIntensity: number;
    chromaticOffsetX: number;
    chromaticOffsetY: number;
    noiseOpacity: number;
    dofBokehScale: number;
    motionBlurStrength: number;
  };
};

const TIMELINE_PRESETS = [
  "Club Cuts",
  "Cinematic Drift",
  "Hyper Zoom",
] as const;

type TimelinePreset = (typeof TIMELINE_PRESETS)[number];

const TIMELINE_PRESET_OPTIONS = Object.fromEntries(
  TIMELINE_PRESETS.map((preset) => [preset, preset]),
) as Record<TimelinePreset, TimelinePreset>;

function asTimelinePreset(value: string): TimelinePreset {
  return TIMELINE_PRESETS.includes(value as TimelinePreset)
    ? (value as TimelinePreset)
    : "Club Cuts";
}

const DISTORTION_AUTOMATION_MODE_OPTIONS: Record<
  DistortionAutomationMode,
  DistortionAutomationMode
> = {
  Off: "Off",
  Sweep: "Sweep",
  "BPM Buzz": "BPM Buzz",
};

const DISTORTION_CHARACTER_MODE_OPTIONS: Record<
  DistortionCharacterMode,
  DistortionCharacterMode
> = {
  Organic: "Organic",
  Shear: "Shear",
  Rip: "Rip",
  Crunch: "Crunch",
  Melt: "Melt",
};

type GlitchModeControl = "Sporadic" | "Constant Mild" | "Constant Wild";

const GLITCH_MODE_OPTIONS: Record<GlitchModeControl, GlitchModeControl> = {
  Sporadic: "Sporadic",
  "Constant Mild": "Constant Mild",
  "Constant Wild": "Constant Wild",
};

const LOOK_PRESETS = [
  "Neon Fracture",
  "Mono Brutalist",
  "Wireframe Acid",
  "Xerox Collapse",
] as const;

type LookPreset = (typeof LOOK_PRESETS)[number];

const LOOK_PRESET_OPTIONS = Object.fromEntries(
  LOOK_PRESETS.map((preset) => [preset, preset]),
) as Record<LookPreset, LookPreset>;

const BPM_STEPS_OPTIONS: Record<string, number> = {
  Quarter: 1,
  Eighth: 2,
  Sixteenth: 4,
};

type FogMode = "Linear" | "Exp2";

const FOG_MODE_OPTIONS: Record<FogMode, FogMode> = {
  Linear: "Linear",
  Exp2: "Exp2",
};

function asDistortionAutomationMode(value: string): DistortionAutomationMode {
  if (value === "Sweep" || value === "BPM Buzz" || value === "Off") {
    return value;
  }

  return "Off";
}

function asDistortionCharacterMode(value: string): DistortionCharacterMode {
  if (
    value === "Organic" ||
    value === "Shear" ||
    value === "Rip" ||
    value === "Crunch" ||
    value === "Melt"
  ) {
    return value;
  }

  return "Organic";
}

function asGlitchMode(value: string): GlitchMode {
  if (value === "Constant Mild") {
    return GlitchMode.CONSTANT_MILD;
  }
  if (value === "Constant Wild") {
    return GlitchMode.CONSTANT_WILD;
  }
  return GlitchMode.SPORADIC;
}

function asLookPreset(value: string): LookPreset {
  return LOOK_PRESETS.includes(value as LookPreset)
    ? (value as LookPreset)
    : "Neon Fracture";
}

function asFogMode(value: string): FogMode {
  return value === "Exp2" ? "Exp2" : "Linear";
}

type ExportCaptureState = {
  transparentBackground: boolean;
  disableFog: boolean;
};

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

type CameraTrack = {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
  roll: number;
  shake: number;
};

type CameraShot = {
  cut: CameraTrack;
  move: Partial<CameraTrack>;
  duration: number;
  hold: number;
  ease?: string;
};

function createCameraShots(
  preset: TimelinePreset,
  radiusScale: number,
  heightOffset: number,
): CameraShot[] {
  if (preset === "Cinematic Drift") {
    return [
      {
        cut: {
          x: -3.4 * radiusScale,
          y: 1.6 + heightOffset,
          z: 7.6 * radiusScale,
          tx: 0.02,
          ty: 0.11,
          tz: 0,
          fov: 55,
          roll: 0.02,
          shake: 0.005 * radiusScale,
        },
        move: {
          x: 2.1 * radiusScale,
          y: 0.9 + heightOffset,
          z: 5.7 * radiusScale,
          tx: -0.04,
          ty: 0.08,
          tz: 0.01,
          fov: 40,
          roll: -0.03,
          shake: 0.004 * radiusScale,
        },
        duration: 2.1,
        hold: 0.02,
        ease: "sine.inOut",
      },
      {
        cut: {
          x: 5.2 * radiusScale,
          y: 2.5 + heightOffset,
          z: 2.8 * radiusScale,
          tx: -0.08,
          ty: 0.03,
          tz: 0,
          fov: 40,
          roll: 0.07,
          shake: 0.008 * radiusScale,
        },
        move: {
          x: 2.3 * radiusScale,
          y: 0.65 + heightOffset,
          z: 2.1 * radiusScale,
          tx: 0.02,
          ty: 0.11,
          tz: 0,
          fov: 31,
          roll: 0.01,
          shake: 0.007 * radiusScale,
        },
        duration: 1.35,
        hold: 0.02,
        ease: "expo.inOut",
      },
      {
        cut: {
          x: -5.7 * radiusScale,
          y: 0.36 + heightOffset,
          z: 4.3 * radiusScale,
          tx: 0.1,
          ty: 0.07,
          tz: 0.01,
          fov: 60,
          roll: -0.09,
          shake: 0.012 * radiusScale,
        },
        move: {
          x: -2.4 * radiusScale,
          y: 0.2 + heightOffset,
          z: 3.3 * radiusScale,
          tx: 0.01,
          ty: 0.09,
          tz: 0,
          fov: 46,
          roll: -0.03,
          shake: 0.008 * radiusScale,
        },
        duration: 1.12,
        hold: 0.02,
        ease: "power2.inOut",
      },
      {
        cut: {
          x: 0.45 * radiusScale,
          y: -0.18 + heightOffset,
          z: 3.7 * radiusScale,
          tx: 0,
          ty: 0.09,
          tz: 0,
          fov: 54,
          roll: 0,
          shake: 0.009 * radiusScale,
        },
        move: {
          x: -0.2 * radiusScale,
          y: 0.28 + heightOffset,
          z: 5.4 * radiusScale,
          tx: 0.01,
          ty: 0.1,
          tz: 0,
          fov: 42,
          roll: 0.01,
          shake: 0.006 * radiusScale,
        },
        duration: 1.92,
        hold: 0.02,
        ease: "sine.inOut",
      },
      {
        cut: {
          x: 2.9 * radiusScale,
          y: 4.1 + heightOffset,
          z: 3.2 * radiusScale,
          tx: 0.03,
          ty: -0.1,
          tz: 0,
          fov: 48,
          roll: -0.07,
          shake: 0.011 * radiusScale,
        },
        move: {
          x: 1.2 * radiusScale,
          y: 2.6 + heightOffset,
          z: 2.4 * radiusScale,
          tx: 0.06,
          ty: 0.02,
          tz: 0,
          fov: 37,
          roll: -0.02,
          shake: 0.007 * radiusScale,
        },
        duration: 1.04,
        hold: 0.02,
        ease: "power2.inOut",
      },
    ];
  }

  if (preset === "Hyper Zoom") {
    return [
      {
        cut: {
          x: -6.6 * radiusScale,
          y: 0.28 + heightOffset,
          z: 4.6 * radiusScale,
          tx: 0.08,
          ty: 0.1,
          tz: 0.01,
          fov: 76,
          roll: 0.2,
          shake: 0.03 * radiusScale,
        },
        move: {
          x: -3.3 * radiusScale,
          y: 0.16 + heightOffset,
          z: 2.0 * radiusScale,
          tx: -0.03,
          ty: 0.12,
          tz: 0,
          fov: 22,
          roll: 0.08,
          shake: 0.019 * radiusScale,
        },
        duration: 0.56,
        hold: 0.02,
        ease: "power3.inOut",
      },
      {
        cut: {
          x: 1.8 * radiusScale,
          y: 5.4 + heightOffset,
          z: 3.2 * radiusScale,
          tx: 0.03,
          ty: -0.12,
          tz: 0,
          fov: 50,
          roll: -0.12,
          shake: 0.021 * radiusScale,
        },
        move: {
          x: 3.1 * radiusScale,
          y: 2.8 + heightOffset,
          z: 1.9 * radiusScale,
          tx: 0.09,
          ty: 0.08,
          tz: 0,
          fov: 30,
          roll: -0.03,
          shake: 0.013 * radiusScale,
        },
        duration: 0.78,
        hold: 0.02,
        ease: "expo.inOut",
      },
      {
        cut: {
          x: 4.9 * radiusScale,
          y: 0.5 + heightOffset,
          z: 1.8 * radiusScale,
          tx: -0.07,
          ty: 0.05,
          tz: 0,
          fov: 34,
          roll: 0.16,
          shake: 0.026 * radiusScale,
        },
        move: {
          x: 1.0 * radiusScale,
          y: 0.36 + heightOffset,
          z: 1.1 * radiusScale,
          tx: 0.03,
          ty: 0.1,
          tz: 0,
          fov: 20,
          roll: 0.04,
          shake: 0.017 * radiusScale,
        },
        duration: 0.54,
        hold: 0.02,
        ease: "power2.inOut",
      },
      {
        cut: {
          x: -1.4 * radiusScale,
          y: 0.9 + heightOffset,
          z: 7.8 * radiusScale,
          tx: 0,
          ty: 0.11,
          tz: 0.01,
          fov: 64,
          roll: -0.04,
          shake: 0.01 * radiusScale,
        },
        move: {
          x: 0.9 * radiusScale,
          y: 0.52 + heightOffset,
          z: 5.3 * radiusScale,
          tx: -0.02,
          ty: 0.08,
          tz: 0.01,
          fov: 42,
          roll: 0.01,
          shake: 0.008 * radiusScale,
        },
        duration: 1.48,
        hold: 0.02,
        ease: "sine.inOut",
      },
      {
        cut: {
          x: -2.8 * radiusScale,
          y: -0.4 + heightOffset,
          z: 4.5 * radiusScale,
          tx: 0.04,
          ty: 0.02,
          tz: 0,
          fov: 69,
          roll: -0.18,
          shake: 0.034 * radiusScale,
        },
        move: {
          x: -0.1 * radiusScale,
          y: 0.32 + heightOffset,
          z: 3.1 * radiusScale,
          tx: 0,
          ty: 0.12,
          tz: 0,
          fov: 45,
          roll: -0.06,
          shake: 0.018 * radiusScale,
        },
        duration: 0.62,
        hold: 0.02,
        ease: "power3.inOut",
      },
      {
        cut: {
          x: 3.2 * radiusScale,
          y: 0.18 + heightOffset,
          z: 1.5 * radiusScale,
          tx: -0.05,
          ty: 0.1,
          tz: 0,
          fov: 28,
          roll: 0.11,
          shake: 0.024 * radiusScale,
        },
        move: {
          x: -0.6 * radiusScale,
          y: 0.28 + heightOffset,
          z: 2.7 * radiusScale,
          tx: 0.02,
          ty: 0.08,
          tz: 0,
          fov: 40,
          roll: 0.02,
          shake: 0.014 * radiusScale,
        },
        duration: 0.62,
        hold: 0.02,
        ease: "power2.inOut",
      },
      {
        cut: {
          x: 0.1 * radiusScale,
          y: 1.1 + heightOffset,
          z: 7.0 * radiusScale,
          tx: 0,
          ty: 0.12,
          tz: 0.01,
          fov: 56,
          roll: 0.03,
          shake: 0.008 * radiusScale,
        },
        move: {
          x: -1.0 * radiusScale,
          y: 0.42 + heightOffset,
          z: 4.6 * radiusScale,
          tx: -0.01,
          ty: 0.08,
          tz: 0.01,
          fov: 34,
          roll: 0,
          shake: 0.006 * radiusScale,
        },
        duration: 1.74,
        hold: 0.02,
        ease: "sine.inOut",
      },
    ];
  }

  return [
    {
      cut: {
        x: -7.6 * radiusScale,
        y: 0.3 + heightOffset,
        z: 5.2 * radiusScale,
        tx: 0.08,
        ty: 0.1,
        tz: 0.02,
        fov: 70,
        roll: 0.16,
        shake: 0.024 * radiusScale,
      },
      move: {
        x: -5.4 * radiusScale,
        y: 0.14 + heightOffset,
        z: 3.7 * radiusScale,
        tx: -0.06,
        ty: 0.16,
        tz: 0.01,
        fov: 52,
        roll: 0.04,
        shake: 0.015 * radiusScale,
      },
      duration: 0.72,
      hold: 0.02,
      ease: "power2.inOut",
    },
    {
      cut: {
        x: 2.5 * radiusScale,
        y: 4.9 + heightOffset,
        z: 3.3 * radiusScale,
        tx: 0.02,
        ty: -0.1,
        tz: 0,
        fov: 46,
        roll: -0.1,
        shake: 0.02 * radiusScale,
      },
      move: {
        x: 2.9 * radiusScale,
        y: 3.1 + heightOffset,
        z: 2.2 * radiusScale,
        tx: 0.11,
        ty: 0.06,
        tz: 0,
        fov: 38,
        roll: -0.04,
        shake: 0.012 * radiusScale,
      },
      duration: 0.9,
      hold: 0.02,
      ease: "expo.inOut",
    },
    {
      cut: {
        x: -1.1 * radiusScale,
        y: 1.6 + heightOffset,
        z: 7.4 * radiusScale,
        tx: 0.01,
        ty: 0.11,
        tz: 0,
        fov: 58,
        roll: 0.02,
        shake: 0.008 * radiusScale,
      },
      move: {
        x: 1.2 * radiusScale,
        y: 0.85 + heightOffset,
        z: 5.5 * radiusScale,
        tx: -0.04,
        ty: 0.08,
        tz: 0.02,
        fov: 42,
        roll: -0.02,
        shake: 0.007 * radiusScale,
      },
      duration: 1.68,
      hold: 0.02,
      ease: "sine.inOut",
    },
    {
      cut: {
        x: 5.5 * radiusScale,
        y: 0.42 + heightOffset,
        z: 2.1 * radiusScale,
        tx: -0.09,
        ty: 0.03,
        tz: 0,
        fov: 34,
        roll: 0.2,
        shake: 0.031 * radiusScale,
      },
      move: {
        x: 3.2 * radiusScale,
        y: 0.18 + heightOffset,
        z: 1.35 * radiusScale,
        tx: 0.07,
        ty: 0.13,
        tz: 0,
        fov: 24,
        roll: 0.09,
        shake: 0.02 * radiusScale,
      },
      duration: 0.58,
      hold: 0.02,
      ease: "power3.inOut",
    },
    {
      cut: {
        x: -3.1 * radiusScale,
        y: -0.34 + heightOffset,
        z: 4.8 * radiusScale,
        tx: 0.04,
        ty: 0.0,
        tz: 0,
        fov: 64,
        roll: -0.19,
        shake: 0.032 * radiusScale,
      },
      move: {
        x: -0.4 * radiusScale,
        y: 0.34 + heightOffset,
        z: 3.4 * radiusScale,
        tx: 0.01,
        ty: 0.11,
        tz: 0.01,
        fov: 47,
        roll: -0.07,
        shake: 0.018 * radiusScale,
      },
      duration: 0.68,
      hold: 0.02,
      ease: "power3.inOut",
    },
    {
      cut: {
        x: -4.2 * radiusScale,
        y: 2.25 + heightOffset,
        z: 1.2 * radiusScale,
        tx: 0.1,
        ty: -0.06,
        tz: 0,
        fov: 56,
        roll: 0.09,
        shake: 0.014 * radiusScale,
      },
      move: {
        x: 3.9 * radiusScale,
        y: 0.52 + heightOffset,
        z: 1.9 * radiusScale,
        tx: -0.11,
        ty: 0.09,
        tz: 0,
        fov: 43,
        roll: -0.08,
        shake: 0.016 * radiusScale,
      },
      duration: 0.96,
      hold: 0.02,
      ease: "sine.inOut",
    },
    {
      cut: {
        x: 0.25 * radiusScale,
        y: 1.1 + heightOffset,
        z: 7.1 * radiusScale,
        tx: 0,
        ty: 0.12,
        tz: 0.01,
        fov: 52,
        roll: 0.03,
        shake: 0.007 * radiusScale,
      },
      move: {
        x: -0.9 * radiusScale,
        y: 0.4 + heightOffset,
        z: 4.8 * radiusScale,
        tx: -0.02,
        ty: 0.08,
        tz: 0,
        fov: 36,
        roll: 0.0,
        shake: 0.006 * radiusScale,
      },
      duration: 1.95,
      hold: 0.02,
      ease: "sine.inOut",
    },
    {
      cut: {
        x: 2.6 * radiusScale,
        y: 0.22 + heightOffset,
        z: 1.55 * radiusScale,
        tx: -0.06,
        ty: 0.09,
        tz: 0.02,
        fov: 29,
        roll: 0.12,
        shake: 0.023 * radiusScale,
      },
      move: {
        x: 0.9 * radiusScale,
        y: 0.36 + heightOffset,
        z: 2.4 * radiusScale,
        tx: 0.03,
        ty: 0.07,
        tz: 0.01,
        fov: 40,
        roll: 0.02,
        shake: 0.013 * radiusScale,
      },
      duration: 0.64,
      hold: 0.02,
      ease: "power2.inOut",
    },
    {
      cut: {
        x: -1.6 * radiusScale,
        y: 0.7 + heightOffset,
        z: 6.2 * radiusScale,
        tx: 0,
        ty: 0.1,
        tz: 0,
        fov: 60,
        roll: -0.05,
        shake: 0.011 * radiusScale,
      },
      move: {
        x: 0.1 * radiusScale,
        y: 0.46 + heightOffset,
        z: 5.0 * radiusScale,
        tx: 0.01,
        ty: 0.08,
        tz: 0,
        fov: 45,
        roll: 0,
        shake: 0.008 * radiusScale,
      },
      duration: 0.88,
      hold: 0.02,
      ease: "power2.inOut",
    },
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function TextDestructionExperience() {
  const [paused, setPaused] = useState(false);
  const [seed, setSeed] = useState(() => Math.random() * 1000);
  const [manualRenderedText, setManualRenderedText] = useState(DEFAULT_TEXT);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineEnabled, setTimelineEnabled] = useState(false);
  const [exportCaptureState, setExportCaptureState] =
    useState<ExportCaptureState>({
      transparentBackground: false,
      disableFog: false,
    });

  const draftTextRef = useRef(DEFAULT_TEXT);
  const exportScaleRef = useRef(2);
  const exportTransparentRef = useRef(false);
  const exportDisableFogRef = useRef(true);
  const exportSequenceDurationRef = useRef(4);
  const exportSequenceFpsRef = useRef(24);
  const exportSequencePaddingRef = useRef(4);
  const exportSequencePrefixRef = useRef("type-collapse-seq");
  const orbitControlsRef = useRef<OrbitControlsImpl>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const timelineSnapshotRef = useRef<TimelineSnapshot | null>(null);
  const timelineAutoPlayRef = useRef(true);
  const timelineDistortionOverrideRef =
    useRef<Partial<DistortionSettings> | null>(null);
  const { exportScreenshot, exportSequence } = useScreenshotExport();

  const togglePause = useCallback(() => {
    setPaused((current) => !current);
  }, []);

  const randomizeSeed = useCallback(() => {
    setSeed(Math.random() * 1000);
  }, []);

  const regenerateText = useCallback(() => {
    const nextText = draftTextRef.current.trim().replace(/\s+/g, " ");
    setManualRenderedText(nextText.length > 0 ? nextText : DEFAULT_TEXT);
  }, []);

  const beginExportCapture = useCallback(
    async (transparentBackground: boolean) => {
      if (!transparentBackground) {
        return;
      }

      setExportCaptureState({
        transparentBackground: true,
        disableFog: exportDisableFogRef.current,
      });
      await waitForAnimationFrame();
    },
    [],
  );

  const endExportCapture = useCallback(
    async (transparentBackground: boolean) => {
      if (!transparentBackground) {
        return;
      }

      setExportCaptureState({
        transparentBackground: false,
        disableFog: false,
      });
      await waitForAnimationFrame();
    },
    [],
  );

  useControls(
    "Playback",
    () => ({
      pauseOrResume: button(() => togglePause()),
      randomizeSeed: button(() => randomizeSeed()),
    }),
    [togglePause, randomizeSeed],
  );

  const [textControls] = useControls(
    "Text",
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
  );

  const [distortionControls, setDistortionControls] = useControls(
    "Distortion",
    () => ({
      noiseAmplitude: { value: 1.6, min: 0, max: 4, step: 0.01 },
      noiseFrequency: { value: 0.5, min: 0.05, max: 4, step: 0.01 },
      noiseSpeed: { value: 1.0, min: 0, max: 5, step: 0.01 },
      followRate: { value: 18, min: 1, max: 50, step: 0.1 },
      radius: { value: 0.5, min: 0.05, max: 3, step: 0.01 },
      explodeAmplitude: { value: 1.5, min: 0, max: 5, step: 0.01 },
      rotationAmplitude: { value: 1.0, min: 0, max: 5, step: 0.01 },
      characterMode: {
        value: "Organic",
        options: DISTORTION_CHARACTER_MODE_OPTIONS,
      },
      characterStrength: { value: 1.0, min: 0, max: 2.5, step: 0.01 },
      spring: { value: 0.05, min: 0.001, max: 0.2, step: 0.001 },
      friction: { value: 0.9, min: 0.5, max: 0.999, step: 0.001 },
      idleMix: { value: 0.0, min: 0, max: 0.5, step: 0.001 },
      color: "#f0f5ff",
      emissive: "#0b55c7",
      emissiveIntensity: { value: 0.75, min: 0, max: 3, step: 0.01 },
      emissiveVelocityBoost: { value: 5.0, min: 0, max: 20, step: 0.1 },
      roughness: { value: 0.24, min: 0, max: 1, step: 0.01 },
      metalness: { value: 0.2, min: 0, max: 1, step: 0.01 },
      wireframe: false,
    }),
    [],
  );

  const [automationControls, setAutomationControls] = useControls(
    "Distortion Automation",
    () => ({
      mode: { value: "Sweep", options: DISTORTION_AUTOMATION_MODE_OPTIONS },
      intensity: { value: 1, min: 0, max: 1, step: 0.01 },
      pointerZOffset: { value: 0.02, min: -1.5, max: 1.5, step: 0.01 },
      sweepCycleSeconds: { value: 6.4, min: 1.5, max: 30, step: 0.1 },
      sweepWidth: { value: 0.95, min: 0.1, max: 1.3, step: 0.01 },
      sweepCurve: { value: 0.18, min: -0.6, max: 0.8, step: 0.01 },
      sweepBob: { value: 0.14, min: 0, max: 1, step: 0.01 },
      sweepBobFrequency: { value: 2.0, min: 0.1, max: 8, step: 0.01 },
      sweepDepth: { value: 0.1, min: 0, max: 1, step: 0.01 },
      bpm: { value: 130, min: 40, max: 240, step: 1 },
      stepsPerBeat: { value: 1, options: BPM_STEPS_OPTIONS },
      buzzFraction: { value: 0.5, min: 0.05, max: 1, step: 0.01 },
      buzzAttack: { value: 0.08, min: 0.01, max: 0.49, step: 0.01 },
      buzzRelease: { value: 0.24, min: 0.01, max: 0.49, step: 0.01 },
      spreadX: { value: 0.95, min: 0.05, max: 1.3, step: 0.01 },
      spreadY: { value: 0.82, min: 0.05, max: 1.3, step: 0.01 },
      centerBias: { value: 0.45, min: 0, max: 1, step: 0.01 },
      travelPortion: { value: 0.22, min: 0.01, max: 1, step: 0.01 },
    }),
    [],
  );

  const [postFxControls, setPostFxControls] = useControls(
    "Post FX",
    () => ({
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
      trailEnabled: false,
      trailStrength: { value: 0.008, min: 0, max: 0.03, step: 0.0001 },
      trailDispersion: { value: 0.35, min: 0, max: 1.5, step: 0.01 },
      trailSamples: { value: 10, min: 2, max: 24, step: 1 },
      trailOpacity: { value: 0.4, min: 0, max: 1, step: 0.01 },
      brutalistCompositeEnabled: false,
      brutalistPosterizeSteps: { value: 7, min: 2, max: 24, step: 1 },
      brutalistEdgeStrength: { value: 1.1, min: 0, max: 4, step: 0.01 },
      brutalistDitherStrength: { value: 0.18, min: 0, max: 1, step: 0.01 },
      brutalistGrain: { value: 0.03, min: 0, max: 0.4, step: 0.001 },
      brutalistWarp: { value: 0.12, min: 0, max: 1.25, step: 0.01 },
      brutalistOpacity: { value: 0.45, min: 0, max: 1, step: 0.01 },
      pixelationEnabled: false,
      pixelationGranularity: { value: 3, min: 1, max: 18, step: 1 },
      scanlineEnabled: false,
      scanlineDensity: { value: 1.25, min: 0.1, max: 4, step: 0.01 },
      scanlineOpacity: { value: 0.22, min: 0, max: 1, step: 0.01 },
      colorDepthEnabled: false,
      colorDepthBits: { value: 16, min: 2, max: 32, step: 1 },
      glitchEnabled: false,
      glitchMode: { value: "Sporadic", options: GLITCH_MODE_OPTIONS },
      glitchDelayMin: { value: 0.9, min: 0, max: 5, step: 0.01 },
      glitchDelayMax: { value: 1.8, min: 0, max: 5, step: 0.01 },
      glitchDurationMin: { value: 0.09, min: 0, max: 2, step: 0.01 },
      glitchDurationMax: { value: 0.22, min: 0, max: 2, step: 0.01 },
      glitchStrengthX: { value: 0.12, min: 0, max: 2, step: 0.01 },
      glitchStrengthY: { value: 0.22, min: 0, max: 2, step: 0.01 },
      glitchChromaticX: { value: 0.001, min: 0, max: 0.02, step: 0.0001 },
      glitchChromaticY: { value: 0.0015, min: 0, max: 0.02, step: 0.0001 },
      glitchRatio: { value: 0.86, min: 0, max: 1, step: 0.01 },
      chromaticEnabled: true,
      chromaticOffsetX: { value: 0.0012, min: 0, max: 0.01, step: 0.0001 },
      chromaticOffsetY: { value: 0.0012, min: 0, max: 0.01, step: 0.0001 },
      noiseEnabled: true,
      noiseOpacity: { value: 0.12, min: 0, max: 0.8, step: 0.01 },
      vignetteEnabled: true,
      vignetteOffset: { value: 0.26, min: 0, max: 1, step: 0.01 },
      vignetteDarkness: { value: 0.9, min: 0, max: 2, step: 0.01 },
    }),
    [],
  );

  const [environmentControls, setEnvironmentControls] = useControls(
    "Environment",
    () => ({
      backgroundColor: "#080b12",
      fogEnabled: true,
      fogMode: { value: "Linear", options: FOG_MODE_OPTIONS },
      fogColor: "#080b12",
      fogNear: { value: 12, min: 0.1, max: 120, step: 0.1 },
      fogFar: { value: 34, min: 0.2, max: 240, step: 0.1 },
      fogDensity: { value: 0.045, min: 0.001, max: 0.25, step: 0.001 },
      groundEnabled: false,
      groundColor: "#070d14",
      groundY: { value: -2.8, min: -12, max: 4, step: 0.01 },
      groundSize: { value: 90, min: 10, max: 300, step: 1 },
      groundRoughness: { value: 0.95, min: 0, max: 1, step: 0.01 },
      groundMetalness: { value: 0.05, min: 0, max: 1, step: 0.01 },
    }),
    [],
  );
  const lookPresetRef = useRef<LookPreset>("Neon Fracture");
  const distortionControlsRef = useRef(distortionControls);
  const postFxControlsRef = useRef(postFxControls);
  const setDistortionControlsRef = useRef(setDistortionControls);
  const setPostFxControlsRef = useRef(setPostFxControls);
  const setAutomationControlsRef = useRef(setAutomationControls);
  const setEnvironmentControlsRef = useRef(setEnvironmentControls);

  const stopTimeline = useCallback(() => {
    timelineRef.current?.kill();
    timelineRef.current = null;
    timelineDistortionOverrideRef.current = null;
    setTimelinePlaying(false);
  }, []);

  const resetTimeline = useCallback(() => {
    stopTimeline();
    timelineDistortionOverrideRef.current = null;

    const snapshot = timelineSnapshotRef.current;
    const controls = orbitControlsRef.current;

    if (!snapshot || !controls) {
      return;
    }

    setDistortionControlsRef.current(snapshot.distortion);
    setPostFxControlsRef.current(snapshot.postFx);
    const activeCamera = controls.object;
    activeCamera.position.copy(snapshot.cameraPosition);
    if (activeCamera instanceof PerspectiveCamera) {
      activeCamera.fov = snapshot.cameraFov;
      activeCamera.updateProjectionMatrix();
    }
    controls.target.copy(snapshot.cameraTarget);
    controls.update();
  }, [stopTimeline]);

  const applyLookPreset = useCallback(
    (preset: LookPreset) => {
      stopTimeline();
      setTimelineEnabled(false);
      setTimelinePlaying(false);
      timelineDistortionOverrideRef.current = null;

      if (preset === "Mono Brutalist") {
        setDistortionControlsRef.current({
          noiseAmplitude: 1.25,
          noiseFrequency: 0.46,
          noiseSpeed: 0.85,
          followRate: 18,
          radius: 0.62,
          explodeAmplitude: 1.7,
          rotationAmplitude: 0.8,
          characterMode: "Crunch",
          characterStrength: 1.35,
          spring: 0.058,
          friction: 0.885,
          idleMix: 0,
          color: "#ecece6",
          emissive: "#f8f8f4",
          emissiveIntensity: 0.58,
          emissiveVelocityBoost: 6.8,
          roughness: 0.82,
          metalness: 0.06,
          wireframe: false,
        });

        setAutomationControlsRef.current({
          mode: "BPM Buzz",
          intensity: 0.75,
          pointerZOffset: 0.02,
          bpm: 122,
          stepsPerBeat: 1,
          buzzFraction: 0.42,
          spreadX: 0.88,
          spreadY: 0.68,
          centerBias: 0.58,
          travelPortion: 0.28,
        });

        setPostFxControlsRef.current({
          enabled: true,
          bloomEnabled: true,
          bloomIntensity: 0.78,
          bloomThreshold: 0.28,
          bloomSmoothing: 0.64,
          dofEnabled: false,
          motionBlurEnabled: false,
          trailEnabled: true,
          trailStrength: 0.0048,
          trailDispersion: 0.18,
          trailSamples: 8,
          trailOpacity: 0.33,
          brutalistCompositeEnabled: true,
          brutalistPosterizeSteps: 4,
          brutalistEdgeStrength: 2.35,
          brutalistDitherStrength: 0.12,
          brutalistGrain: 0.07,
          brutalistWarp: 0.04,
          brutalistOpacity: 0.82,
          pixelationEnabled: true,
          pixelationGranularity: 2,
          scanlineEnabled: true,
          scanlineDensity: 1.95,
          scanlineOpacity: 0.35,
          colorDepthEnabled: true,
          colorDepthBits: 8,
          glitchEnabled: false,
          chromaticEnabled: false,
          noiseEnabled: true,
          noiseOpacity: 0.17,
          vignetteEnabled: true,
          vignetteOffset: 0.24,
          vignetteDarkness: 1.2,
        });

        setEnvironmentControlsRef.current({
          backgroundColor: "#0e0e0d",
          fogEnabled: true,
          fogColor: "#161614",
          fogNear: 8.8,
          fogFar: 29,
          fogDensity: 0.06,
          groundEnabled: false,
        });

        return;
      }

      if (preset === "Wireframe Acid") {
        setDistortionControlsRef.current({
          noiseAmplitude: 2.3,
          noiseFrequency: 0.74,
          noiseSpeed: 1.45,
          followRate: 18,
          radius: 0.52,
          explodeAmplitude: 1.95,
          rotationAmplitude: 1.4,
          characterMode: "Shear",
          characterStrength: 1.45,
          spring: 0.048,
          friction: 0.894,
          idleMix: 0,
          color: "#a9ff4f",
          emissive: "#6aff00",
          emissiveIntensity: 1.55,
          emissiveVelocityBoost: 11.6,
          roughness: 0.42,
          metalness: 0.48,
          wireframe: true,
        });

        setAutomationControlsRef.current({
          mode: "BPM Buzz",
          intensity: 1,
          pointerZOffset: 0.02,
          bpm: 144,
          stepsPerBeat: 2,
          buzzFraction: 0.56,
          spreadX: 1.1,
          spreadY: 0.9,
          centerBias: 0.35,
          travelPortion: 0.2,
        });

        setPostFxControlsRef.current({
          enabled: true,
          bloomEnabled: true,
          bloomIntensity: 2.2,
          bloomThreshold: 0.18,
          bloomSmoothing: 0.72,
          dofEnabled: false,
          motionBlurEnabled: false,
          trailEnabled: true,
          trailStrength: 0.011,
          trailDispersion: 0.62,
          trailSamples: 13,
          trailOpacity: 0.52,
          brutalistCompositeEnabled: true,
          brutalistPosterizeSteps: 6,
          brutalistEdgeStrength: 1.9,
          brutalistDitherStrength: 0.26,
          brutalistGrain: 0.06,
          brutalistWarp: 0.34,
          brutalistOpacity: 0.55,
          pixelationEnabled: false,
          scanlineEnabled: true,
          scanlineDensity: 2.7,
          scanlineOpacity: 0.26,
          colorDepthEnabled: false,
          glitchEnabled: true,
          glitchMode: "Constant Wild",
          glitchDelayMin: 0.2,
          glitchDelayMax: 0.6,
          glitchDurationMin: 0.06,
          glitchDurationMax: 0.12,
          glitchStrengthX: 0.58,
          glitchStrengthY: 0.92,
          glitchRatio: 0.68,
          chromaticEnabled: true,
          chromaticOffsetX: 0.0028,
          chromaticOffsetY: 0.0022,
          noiseEnabled: true,
          noiseOpacity: 0.19,
          vignetteEnabled: true,
          vignetteOffset: 0.15,
          vignetteDarkness: 1.35,
        });

        setEnvironmentControlsRef.current({
          backgroundColor: "#031003",
          fogEnabled: true,
          fogColor: "#092709",
          fogNear: 9.8,
          fogFar: 33,
          fogDensity: 0.08,
          groundEnabled: true,
          groundColor: "#041404",
          groundRoughness: 0.9,
          groundMetalness: 0.1,
        });

        return;
      }

      if (preset === "Xerox Collapse") {
        setDistortionControlsRef.current({
          noiseAmplitude: 2.05,
          noiseFrequency: 0.69,
          noiseSpeed: 0.74,
          followRate: 18,
          radius: 0.78,
          explodeAmplitude: 1.82,
          rotationAmplitude: 0.62,
          characterMode: "Melt",
          characterStrength: 1.55,
          spring: 0.044,
          friction: 0.902,
          idleMix: 0,
          color: "#f4f3ed",
          emissive: "#fefef9",
          emissiveIntensity: 0.5,
          emissiveVelocityBoost: 4.2,
          roughness: 0.91,
          metalness: 0.03,
          wireframe: false,
        });

        setAutomationControlsRef.current({
          mode: "Sweep",
          intensity: 0.88,
          pointerZOffset: 0.02,
          sweepCycleSeconds: 9.4,
          sweepWidth: 0.82,
          sweepCurve: 0.36,
          sweepBob: 0.1,
          sweepBobFrequency: 1.2,
          sweepDepth: 0.06,
        });

        setPostFxControlsRef.current({
          enabled: true,
          bloomEnabled: true,
          bloomIntensity: 0.35,
          bloomThreshold: 0.39,
          bloomSmoothing: 0.68,
          dofEnabled: false,
          motionBlurEnabled: false,
          trailEnabled: false,
          brutalistCompositeEnabled: true,
          brutalistPosterizeSteps: 5,
          brutalistEdgeStrength: 2.4,
          brutalistDitherStrength: 0.34,
          brutalistGrain: 0.11,
          brutalistWarp: 0.06,
          brutalistOpacity: 0.88,
          pixelationEnabled: true,
          pixelationGranularity: 4,
          scanlineEnabled: true,
          scanlineDensity: 1.6,
          scanlineOpacity: 0.29,
          colorDepthEnabled: true,
          colorDepthBits: 6,
          glitchEnabled: true,
          glitchMode: "Sporadic",
          glitchDelayMin: 1.3,
          glitchDelayMax: 2.8,
          glitchDurationMin: 0.07,
          glitchDurationMax: 0.15,
          glitchStrengthX: 0.18,
          glitchStrengthY: 0.34,
          glitchRatio: 0.92,
          chromaticEnabled: false,
          noiseEnabled: true,
          noiseOpacity: 0.23,
          vignetteEnabled: true,
          vignetteOffset: 0.32,
          vignetteDarkness: 1.46,
        });

        setEnvironmentControlsRef.current({
          backgroundColor: "#1a1916",
          fogEnabled: true,
          fogColor: "#24211c",
          fogNear: 7.5,
          fogFar: 26,
          fogDensity: 0.072,
          groundEnabled: true,
          groundColor: "#0d0c0a",
          groundRoughness: 1,
          groundMetalness: 0,
        });

        return;
      }

      setDistortionControlsRef.current({
        noiseAmplitude: 1.9,
        noiseFrequency: 0.53,
        noiseSpeed: 1.18,
        followRate: 18,
        radius: 0.56,
        explodeAmplitude: 1.92,
        rotationAmplitude: 1.3,
        characterMode: "Rip",
        characterStrength: 1.2,
        spring: 0.055,
        friction: 0.892,
        idleMix: 0,
        color: "#f0f5ff",
        emissive: "#2a62ff",
        emissiveIntensity: 1.18,
        emissiveVelocityBoost: 9.2,
        roughness: 0.3,
        metalness: 0.28,
        wireframe: false,
      });

      setAutomationControlsRef.current({
        mode: "Sweep",
        intensity: 1,
        pointerZOffset: 0.02,
        sweepCycleSeconds: 6.4,
        sweepWidth: 0.97,
        sweepCurve: 0.2,
        sweepBob: 0.17,
        sweepBobFrequency: 1.9,
        sweepDepth: 0.16,
      });

      setPostFxControlsRef.current({
        enabled: true,
        bloomEnabled: true,
        bloomIntensity: 1.95,
        bloomThreshold: 0.18,
        bloomSmoothing: 0.67,
        dofEnabled: false,
        motionBlurEnabled: false,
        trailEnabled: true,
        trailStrength: 0.0085,
        trailDispersion: 0.42,
        trailSamples: 12,
        trailOpacity: 0.45,
        brutalistCompositeEnabled: true,
        brutalistPosterizeSteps: 7,
        brutalistEdgeStrength: 1.4,
        brutalistDitherStrength: 0.22,
        brutalistGrain: 0.05,
        brutalistWarp: 0.2,
        brutalistOpacity: 0.58,
        pixelationEnabled: false,
        scanlineEnabled: false,
        colorDepthEnabled: false,
        glitchEnabled: false,
        chromaticEnabled: true,
        chromaticOffsetX: 0.0017,
        chromaticOffsetY: 0.0014,
        noiseEnabled: true,
        noiseOpacity: 0.14,
        vignetteEnabled: true,
        vignetteOffset: 0.22,
        vignetteDarkness: 1.08,
      });

      setEnvironmentControlsRef.current({
        backgroundColor: "#050810",
        fogEnabled: true,
        fogColor: "#070e19",
        fogNear: 10.5,
        fogFar: 34,
        fogDensity: 0.052,
        groundEnabled: false,
      });
    },
    [stopTimeline],
  );

  useControls(
    "Look Presets",
    () => ({
      preset: {
        value: "Neon Fracture",
        options: LOOK_PRESET_OPTIONS,
        onChange: (value: string) => {
          lookPresetRef.current = asLookPreset(value);
        },
      },
      apply: button(() => {
        applyLookPreset(lookPresetRef.current);
      }),
    }),
    [applyLookPreset],
  );

  const [timelineControls] = useControls(
    "Timeline",
    () => ({
      enabled: {
        value: false,
        onChange: (value: boolean) => {
          setTimelineEnabled(value);

          if (!value) {
            timelineRef.current?.kill();
            timelineRef.current = null;
            timelineDistortionOverrideRef.current = null;
            setTimelinePlaying(false);
            return;
          }

          if (timelineAutoPlayRef.current) {
            setTimelinePlaying(true);
          }
        },
      },
      autoPlay: {
        value: true,
        onChange: (value: boolean) => {
          timelineAutoPlayRef.current = value;
        },
      },
      loop: true,
      speed: { value: 1, min: 0.25, max: 2.5, step: 0.01 },
      sweepIntensity: { value: 1, min: 0.1, max: 2.5, step: 0.01 },
      preset: { value: "Club Cuts", options: TIMELINE_PRESET_OPTIONS },
      cameraRadius: { value: 9, min: 4, max: 18, step: 0.1 },
      cameraHeight: { value: 0.6, min: -1, max: 4, step: 0.01 },
      lockOrbitWhilePlaying: true,
      play: button(() => setTimelinePlaying(true)),
      pause: button(() => setTimelinePlaying(false)),
      reset: button(() => resetTimeline()),
    }),
    [resetTimeline],
  );

  useControls(
    "Export",
    () => ({
      resolution: {
        value: 2,
        options: { "1x": 1, "2x": 2, "3x": 3, "4x": 4 },
        onChange: (value: number) => {
          exportScaleRef.current = value;
        },
      },
      transparentBackground: {
        value: false,
        onChange: (value: boolean) => {
          exportTransparentRef.current = value;
        },
      },
      disableFogInTransparent: {
        value: true,
        onChange: (value: boolean) => {
          exportDisableFogRef.current = value;
        },
      },
      sequenceDurationSeconds: {
        value: 4,
        min: 0.5,
        max: 30,
        step: 0.1,
        onChange: (value: number) => {
          exportSequenceDurationRef.current = value;
        },
      },
      sequenceFps: {
        value: 24,
        min: 1,
        max: 60,
        step: 1,
        onChange: (value: number) => {
          exportSequenceFpsRef.current = value;
        },
      },
      sequenceFramePadding: {
        value: 4,
        min: 2,
        max: 8,
        step: 1,
        onChange: (value: number) => {
          exportSequencePaddingRef.current = value;
        },
      },
      sequencePrefix: {
        value: "type-collapse-seq",
        onChange: (value: string) => {
          exportSequencePrefixRef.current = value;
        },
      },
      screenshot: button(() => {
        const transparentBackground = exportTransparentRef.current;

        void exportScreenshot({
          scale: exportScaleRef.current,
          transparentBackground,
          filenamePrefix: "type-collapse",
          onBeforeCapture: async () => {
            await beginExportCapture(transparentBackground);
          },
          onAfterCapture: async () => {
            await endExportCapture(transparentBackground);
          },
        });
      }),
      exportPngSequence: button(() => {
        const transparentBackground = exportTransparentRef.current;
        const prefix = exportSequencePrefixRef.current.trim();

        void exportSequence({
          scale: exportScaleRef.current,
          transparentBackground,
          filenamePrefix: prefix.length > 0 ? prefix : "type-collapse-seq",
          durationSeconds: exportSequenceDurationRef.current,
          fps: exportSequenceFpsRef.current,
          framePadding: exportSequencePaddingRef.current,
          onBeforeCapture: async () => {
            await beginExportCapture(transparentBackground);
          },
          onAfterCapture: async () => {
            await endExportCapture(transparentBackground);
          },
        });
      }),
    }),
    [beginExportCapture, endExportCapture, exportScreenshot, exportSequence],
  );

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
      timelineRef.current = null;
    };
  }, []);

  const draftText = useMemo(
    () => textControls.content.trim().replace(/\s+/g, " ") || DEFAULT_TEXT,
    [textControls.content],
  );

  useEffect(() => {
    draftTextRef.current = draftText;
  }, [draftText]);

  useEffect(() => {
    distortionControlsRef.current = distortionControls;
  }, [distortionControls]);

  useEffect(() => {
    postFxControlsRef.current = postFxControls;
  }, [postFxControls]);

  useEffect(() => {
    setDistortionControlsRef.current = setDistortionControls;
  }, [setDistortionControls]);

  useEffect(() => {
    setPostFxControlsRef.current = setPostFxControls;
  }, [setPostFxControls]);

  useEffect(() => {
    setAutomationControlsRef.current = setAutomationControls;
  }, [setAutomationControls]);

  useEffect(() => {
    setEnvironmentControlsRef.current = setEnvironmentControls;
  }, [setEnvironmentControls]);

  useEffect(() => {
    const controls = orbitControlsRef.current;
    if (!controls) {
      return;
    }

    controls.enabled = !(
      timelineEnabled &&
      timelinePlaying &&
      timelineControls.lockOrbitWhilePlaying
    );
  }, [
    timelineEnabled,
    timelineControls.lockOrbitWhilePlaying,
    timelinePlaying,
  ]);

  useEffect(() => {
    const controls = orbitControlsRef.current;
    if (!controls) {
      return;
    }

    if (!timelineEnabled || !timelinePlaying) {
      timelineRef.current?.pause();
      timelineDistortionOverrideRef.current = null;
      return;
    }

    timelineRef.current?.kill();

    const activeCamera = controls.object;
    const distortionState = distortionControlsRef.current;
    const postFxState = postFxControlsRef.current;

    const snapshot: TimelineSnapshot = {
      cameraPosition: activeCamera.position.clone(),
      cameraTarget: controls.target.clone(),
      cameraFov:
        activeCamera instanceof PerspectiveCamera ? activeCamera.fov : 50,
      distortion: {
        noiseAmplitude: distortionState.noiseAmplitude,
        explodeAmplitude: distortionState.explodeAmplitude,
        rotationAmplitude: distortionState.rotationAmplitude,
        spring: distortionState.spring,
        friction: distortionState.friction,
        emissiveVelocityBoost: distortionState.emissiveVelocityBoost,
      },
      postFx: {
        bloomIntensity: postFxState.bloomIntensity,
        chromaticOffsetX: postFxState.chromaticOffsetX,
        chromaticOffsetY: postFxState.chromaticOffsetY,
        noiseOpacity: postFxState.noiseOpacity,
        dofBokehScale: postFxState.dofBokehScale,
        motionBlurStrength: postFxState.motionBlurStrength,
      },
    };

    timelineSnapshotRef.current = snapshot;

    setPostFxControlsRef.current({
      dofEnabled: true,
      motionBlurEnabled: true,
    });

    const radiusScale = timelineControls.cameraRadius / 9;
    const heightOffset =
      timelineControls.cameraHeight - snapshot.cameraPosition.y;

    const cameraTrack = {
      x: activeCamera.position.x,
      y: activeCamera.position.y,
      z: activeCamera.position.z,
      tx: controls.target.x,
      ty: controls.target.y,
      tz: controls.target.z,
      fov: snapshot.cameraFov,
      roll: 0,
      shake: 0,
    };

    const distortionTrack = {
      noiseAmplitude: snapshot.distortion.noiseAmplitude,
      explodeAmplitude: snapshot.distortion.explodeAmplitude,
      rotationAmplitude: snapshot.distortion.rotationAmplitude,
      spring: snapshot.distortion.spring,
      friction: snapshot.distortion.friction,
      emissiveVelocityBoost: snapshot.distortion.emissiveVelocityBoost,
    };

    const baseQuaternion = new Quaternion();
    const forwardAxis = new Vector3();
    const rollQuaternion = new Quaternion();

    const applyCamera = () => {
      const time = performance.now() * 0.001;
      const shakeX = Math.sin(time * 43.7) * cameraTrack.shake;
      const shakeY = Math.cos(time * 57.9) * cameraTrack.shake * 0.7;
      const shakeZ = Math.sin(time * 51.2 + 1.3) * cameraTrack.shake * 0.55;

      activeCamera.position.set(
        cameraTrack.x + shakeX,
        cameraTrack.y + shakeY,
        cameraTrack.z + shakeZ,
      );
      controls.target.set(
        cameraTrack.tx + shakeX * 0.18,
        cameraTrack.ty + shakeY * 0.2,
        cameraTrack.tz + shakeZ * 0.16,
      );
      if (
        activeCamera instanceof PerspectiveCamera &&
        Math.abs(activeCamera.fov - cameraTrack.fov) > 0.0001
      ) {
        activeCamera.fov = cameraTrack.fov;
        activeCamera.updateProjectionMatrix();
      }
      controls.update();

      if (
        activeCamera instanceof PerspectiveCamera &&
        Math.abs(cameraTrack.roll) > 0.0001
      ) {
        baseQuaternion.copy(activeCamera.quaternion);
        forwardAxis.set(0, 0, -1).applyQuaternion(baseQuaternion).normalize();
        rollQuaternion.setFromAxisAngle(forwardAxis, cameraTrack.roll);
        activeCamera.quaternion.copy(baseQuaternion).multiply(rollQuaternion);
      }
    };

    const intensity = timelineControls.sweepIntensity;
    const speed = timelineControls.speed;
    const shots = createCameraShots(
      asTimelinePreset(timelineControls.preset),
      radiusScale,
      heightOffset,
    );

    const timeline = gsap.timeline({
      repeat: timelineControls.loop ? -1 : 0,
      defaults: { ease: "sine.inOut" },
      onUpdate: () => {
        timelineDistortionOverrideRef.current = {
          noiseAmplitude: distortionTrack.noiseAmplitude,
          explodeAmplitude: distortionTrack.explodeAmplitude,
          rotationAmplitude: distortionTrack.rotationAmplitude,
          spring: distortionTrack.spring,
          friction: distortionTrack.friction,
          emissiveVelocityBoost: distortionTrack.emissiveVelocityBoost,
        };
        applyCamera();
      },
      onComplete: () => {
        timelineDistortionOverrideRef.current = null;
        setTimelinePlaying(false);
      },
    });

    timeline
      .to(
        distortionTrack,
        {
          noiseAmplitude: clamp(
            snapshot.distortion.noiseAmplitude * (1 + 0.75 * intensity),
            0,
            4,
          ),
          explodeAmplitude: clamp(
            snapshot.distortion.explodeAmplitude * (1 + 0.55 * intensity),
            0,
            5,
          ),
          rotationAmplitude: clamp(
            snapshot.distortion.rotationAmplitude * (1 + 0.4 * intensity),
            0,
            5,
          ),
          spring: clamp(
            snapshot.distortion.spring * (1 + 0.35 * intensity),
            0.001,
            0.2,
          ),
          friction: clamp(
            snapshot.distortion.friction - 0.06 * intensity,
            0.5,
            0.999,
          ),
          emissiveVelocityBoost: clamp(
            snapshot.distortion.emissiveVelocityBoost * (1 + 0.5 * intensity),
            0,
            20,
          ),
          duration: 2 / speed,
        },
        0,
      )
      .to(
        distortionTrack,
        {
          noiseAmplitude: clamp(
            snapshot.distortion.noiseAmplitude * (1 + 0.25 * intensity),
            0,
            4,
          ),
          explodeAmplitude: clamp(
            snapshot.distortion.explodeAmplitude * (1 + 0.1 * intensity),
            0,
            5,
          ),
          rotationAmplitude: clamp(
            snapshot.distortion.rotationAmplitude * (1 + 0.15 * intensity),
            0,
            5,
          ),
          spring: clamp(
            snapshot.distortion.spring * (1 + 0.08 * intensity),
            0.001,
            0.2,
          ),
          friction: clamp(
            snapshot.distortion.friction - 0.02 * intensity,
            0.5,
            0.999,
          ),
          emissiveVelocityBoost: clamp(
            snapshot.distortion.emissiveVelocityBoost * (1 + 0.2 * intensity),
            0,
            20,
          ),
          duration: 1.8 / speed,
        },
        ">",
      )
      .to(
        distortionTrack,
        {
          noiseAmplitude: snapshot.distortion.noiseAmplitude,
          explodeAmplitude: snapshot.distortion.explodeAmplitude,
          rotationAmplitude: snapshot.distortion.rotationAmplitude,
          spring: snapshot.distortion.spring,
          friction: snapshot.distortion.friction,
          emissiveVelocityBoost: snapshot.distortion.emissiveVelocityBoost,
          duration: 2.2 / speed,
        },
        ">",
      );

    let shotCursor = 0;
    for (const shot of shots) {
      const shotDuration = shot.duration / speed;
      const holdDuration = shot.hold / speed;

      timeline.set(cameraTrack, shot.cut, shotCursor).to(
        cameraTrack,
        {
          ...shot.move,
          duration: shotDuration,
          ease: shot.ease ?? "power2.inOut",
        },
        shotCursor,
      );

      shotCursor += shotDuration + holdDuration;
    }

    timelineRef.current = timeline;

    return () => {
      timeline.kill();
      timelineDistortionOverrideRef.current = null;
      if (timelineRef.current === timeline) {
        timelineRef.current = null;
      }
    };
  }, [
    timelineEnabled,
    timelineControls.loop,
    timelineControls.cameraHeight,
    timelineControls.preset,
    timelineControls.cameraRadius,
    timelineControls.speed,
    timelineControls.sweepIntensity,
    timelinePlaying,
  ]);

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
      characterMode: asDistortionCharacterMode(
        String(distortionControls.characterMode),
      ),
      characterStrength: distortionControls.characterStrength,
    }),
    [distortionControls],
  );

  const distortionAutomation: DistortionAutomationSettings = useMemo(() => {
    const mode = asDistortionAutomationMode(String(automationControls.mode));

    return {
      enabled: mode !== "Off",
      mode,
      intensity: automationControls.intensity,
      pointerZOffset: automationControls.pointerZOffset,
      sweepCycleSeconds: automationControls.sweepCycleSeconds,
      sweepWidth: automationControls.sweepWidth,
      sweepCurve: automationControls.sweepCurve,
      sweepBob: automationControls.sweepBob,
      sweepBobFrequency: automationControls.sweepBobFrequency,
      sweepDepth: automationControls.sweepDepth,
      bpm: automationControls.bpm,
      stepsPerBeat: Number(automationControls.stepsPerBeat),
      buzzFraction: automationControls.buzzFraction,
      buzzAttack: automationControls.buzzAttack,
      buzzRelease: automationControls.buzzRelease,
      spreadX: automationControls.spreadX,
      spreadY: automationControls.spreadY,
      centerBias: automationControls.centerBias,
      travelPortion: automationControls.travelPortion,
    };
  }, [automationControls]);

  const renderedText = textControls.autoRegen ? draftText : manualRenderedText;
  const fogMode = asFogMode(String(environmentControls.fogMode));
  const useTransparentBackground = exportCaptureState.transparentBackground;
  const fogEnabledForRender =
    environmentControls.fogEnabled &&
    !(useTransparentBackground && exportCaptureState.disableFog);

  const chromaticOffset = useMemo(
    () =>
      new Vector2(
        postFxControls.chromaticOffsetX,
        postFxControls.chromaticOffsetY,
      ),
    [postFxControls.chromaticOffsetX, postFxControls.chromaticOffsetY],
  );

  const postFxChildren = useMemo(() => {
    const children: ReactElement[] = [];

    const glitchDelayMin = Math.min(
      postFxControls.glitchDelayMin,
      postFxControls.glitchDelayMax,
    );
    const glitchDelayMax = Math.max(
      postFxControls.glitchDelayMin,
      postFxControls.glitchDelayMax,
    );
    const glitchDurationMin = Math.min(
      postFxControls.glitchDurationMin,
      postFxControls.glitchDurationMax,
    );
    const glitchDurationMax = Math.max(
      postFxControls.glitchDurationMin,
      postFxControls.glitchDurationMax,
    );
    const glitchDelay = new Vector2(glitchDelayMin, glitchDelayMax);
    const glitchDuration = new Vector2(glitchDurationMin, glitchDurationMax);
    const glitchStrength = new Vector2(
      postFxControls.glitchStrengthX,
      postFxControls.glitchStrengthY,
    );
    const glitchChromaticOffset = new Vector2(
      postFxControls.glitchChromaticX,
      postFxControls.glitchChromaticY,
    );

    if (postFxControls.bloomEnabled) {
      children.push(
        <Bloom
          key="bloom"
          intensity={postFxControls.bloomIntensity}
          luminanceThreshold={postFxControls.bloomThreshold}
          luminanceSmoothing={postFxControls.bloomSmoothing}
          mipmapBlur
        />,
      );
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
      );
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
      );
    }

    if (postFxControls.trailEnabled) {
      children.push(
        <TemporalFeedbackTrail
          key="trail"
          strength={postFxControls.trailStrength}
          dispersion={postFxControls.trailDispersion}
          samples={postFxControls.trailSamples}
          opacity={postFxControls.trailOpacity}
        />,
      );
    }

    if (postFxControls.chromaticEnabled) {
      children.push(
        <ChromaticAberration key="chromatic" offset={chromaticOffset} />,
      );
    }

    if (postFxControls.glitchEnabled) {
      children.push(
        <Glitch
          key="glitch"
          mode={asGlitchMode(String(postFxControls.glitchMode))}
          delay={glitchDelay}
          duration={glitchDuration}
          strength={glitchStrength}
          chromaticAberrationOffset={glitchChromaticOffset}
          ratio={postFxControls.glitchRatio}
        />,
      );
    }

    if (postFxControls.pixelationEnabled) {
      children.push(
        <Pixelation
          key="pixelation"
          granularity={postFxControls.pixelationGranularity}
        />,
      );
    }

    if (postFxControls.colorDepthEnabled) {
      children.push(
        <ColorDepth
          key="color-depth"
          bits={Math.round(postFxControls.colorDepthBits)}
        />,
      );
    }

    if (postFxControls.scanlineEnabled) {
      children.push(
        <Scanline
          key="scanline"
          density={postFxControls.scanlineDensity}
          opacity={postFxControls.scanlineOpacity}
        />,
      );
    }

    if (postFxControls.noiseEnabled) {
      children.push(
        <Noise
          key="noise"
          blendFunction={BlendFunction.OVERLAY}
          opacity={postFxControls.noiseOpacity}
        />,
      );
    }

    if (postFxControls.brutalistCompositeEnabled) {
      children.push(
        <BrutalistCompositeFx
          key="brutalist-composite"
          posterizeSteps={postFxControls.brutalistPosterizeSteps}
          edgeStrength={postFxControls.brutalistEdgeStrength}
          ditherStrength={postFxControls.brutalistDitherStrength}
          grain={postFxControls.brutalistGrain}
          warp={postFxControls.brutalistWarp}
          opacity={postFxControls.brutalistOpacity}
        />,
      );
    }

    if (postFxControls.vignetteEnabled) {
      children.push(
        <Vignette
          key="vignette"
          eskil={false}
          offset={postFxControls.vignetteOffset}
          darkness={postFxControls.vignetteDarkness}
        />,
      );
    }

    return children;
  }, [chromaticOffset, postFxControls]);

  const meshKey = useMemo(
    () =>
      [
        renderedText,
        textControls.font,
        textControls.size,
        textControls.depth,
        textControls.curveSegments,
        textControls.bevelEnabled ? 1 : 0,
        textControls.bevelSize,
        textControls.bevelThickness,
      ].join(':'),
    [
      textControls.bevelSize,
      textControls.bevelThickness,
      renderedText,
      textControls.depth,
      textControls.bevelEnabled,
      textControls.curveSegments,
      textControls.font,
      textControls.size,
    ],
  );

  return (
    <>
      {!useTransparentBackground && (
        <color
          attach="background"
          args={[environmentControls.backgroundColor]}
        />
      )}

      {fogEnabledForRender ? (
        fogMode === "Exp2" ? (
          <fogExp2
            attach="fog"
            args={[
              environmentControls.fogColor,
              environmentControls.fogDensity,
            ]}
          />
        ) : (
          <fog
            attach="fog"
            args={[
              environmentControls.fogColor,
              environmentControls.fogNear,
              environmentControls.fogFar,
            ]}
          />
        )
      ) : (
        <fog
          attach="fog"
          args={[environmentControls.backgroundColor, 10000, 10001]}
        />
      )}

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
        automation={distortionAutomation}
        distortionOverrideRef={timelineDistortionOverrideRef}
        onTogglePause={togglePause}
      />

      {environmentControls.groundEnabled && (
        <mesh
          position={[0, environmentControls.groundY, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry
            args={[
              environmentControls.groundSize,
              environmentControls.groundSize,
            ]}
          />
          <meshStandardMaterial
            color={environmentControls.groundColor}
            roughness={environmentControls.groundRoughness}
            metalness={environmentControls.groundMetalness}
          />
        </mesh>
      )}

      <OrbitControls
        ref={orbitControlsRef}
        makeDefault
        enabled={
          !(
            timelineEnabled &&
            timelinePlaying &&
            timelineControls.lockOrbitWhilePlaying
          )
        }
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
  );
}
