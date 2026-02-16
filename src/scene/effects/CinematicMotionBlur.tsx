import { forwardRef, useMemo } from 'react'
import { BlendFunction, Effect } from 'postprocessing'
import { Uniform, Vector2 } from 'three'

type DirectionalMotionBlurProps = {
  strength?: number
  direction?: [number, number]
  samples?: number
  opacity?: number
  blendFunction?: BlendFunction
}

class DirectionalMotionBlurEffect extends Effect {
  constructor({
    strength = 0.0015,
    direction = [1, 0.35],
    samples = 8,
    opacity = 0.3,
    blendFunction = BlendFunction.NORMAL,
  }: Required<DirectionalMotionBlurProps>) {
    super('DirectionalMotionBlurEffect', fragmentShader, {
      blendFunction,
      uniforms: new Map<string, Uniform<unknown>>([
        ['uStrength', new Uniform(strength)],
        ['uDirection', new Uniform(new Vector2(direction[0], direction[1]))],
        ['uSamples', new Uniform(Math.max(2, Math.floor(samples)))],
      ]),
    })

    this.blendMode.opacity.value = opacity
  }
}

const fragmentShader = /* glsl */ `
uniform float uStrength;
uniform vec2 uDirection;
uniform float uSamples;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 dir = normalize(uDirection);

  if (length(dir) < 0.0001 || uStrength <= 0.0) {
    outputColor = inputColor;
    return;
  }

  const int MAX_SAMPLES = 24;
  vec4 accum = vec4(0.0);
  float totalWeight = 0.0;
  float sampleCount = clamp(uSamples, 2.0, float(MAX_SAMPLES));

  for (int i = 0; i < MAX_SAMPLES; i++) {
    if (float(i) >= sampleCount) {
      break;
    }

    float t = (float(i) / max(sampleCount - 1.0, 1.0)) * 2.0 - 1.0;
    float w = 1.0 - abs(t);
    vec2 offset = dir * t * uStrength;

    accum += texture2D(inputBuffer, uv + offset) * w;
    totalWeight += w;
  }

  outputColor = accum / max(totalWeight, 0.00001);
}
`

export const CinematicMotionBlur = forwardRef<
  DirectionalMotionBlurEffect,
  DirectionalMotionBlurProps
>(function CinematicMotionBlur(
  {
    strength = 0.0015,
    direction = [1, 0.35],
    samples = 8,
    opacity = 0.3,
    blendFunction = BlendFunction.NORMAL,
  },
  ref,
) {
  const effect = useMemo(
    () =>
      new DirectionalMotionBlurEffect({
        strength,
        direction,
        samples,
        opacity,
        blendFunction,
      }),
    [blendFunction, direction, opacity, samples, strength],
  )

  return <primitive ref={ref} object={effect} />
})
