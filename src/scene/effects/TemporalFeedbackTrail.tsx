import { forwardRef, useMemo } from 'react'
import { BlendFunction, Effect } from 'postprocessing'
import { Uniform, WebGLRenderTarget, WebGLRenderer } from 'three'

type TemporalFeedbackTrailProps = {
  strength?: number
  dispersion?: number
  samples?: number
  opacity?: number
  blendFunction?: BlendFunction
}

class TemporalFeedbackTrailEffect extends Effect {
  constructor({
    strength = 0.008,
    dispersion = 0.35,
    samples = 10,
    opacity = 0.4,
    blendFunction = BlendFunction.NORMAL,
  }: Required<TemporalFeedbackTrailProps>) {
    super('TemporalFeedbackTrailEffect', fragmentShader, {
      blendFunction,
      uniforms: new Map<string, Uniform<unknown>>([
        ['uStrength', new Uniform(Math.max(0, strength))],
        ['uDispersion', new Uniform(Math.max(0, dispersion))],
        ['uSamples', new Uniform(Math.max(2, Math.floor(samples)))],
        ['uTime', new Uniform(0)],
      ]),
    })

    this.blendMode.opacity.value = opacity
  }

  override update(
    _renderer: WebGLRenderer,
    _inputBuffer: WebGLRenderTarget,
    deltaTime = 0,
  ): void {
    const timeUniform = this.uniforms.get('uTime') as Uniform<number> | undefined
    if (timeUniform) {
      timeUniform.value += deltaTime
    }
  }
}

const fragmentShader = /* glsl */ `
uniform float uStrength;
uniform float uDispersion;
uniform float uSamples;
uniform float uTime;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uStrength <= 0.000001) {
    outputColor = inputColor;
    return;
  }

  const int MAX_SAMPLES = 24;
  float sampleCount = clamp(uSamples, 2.0, float(MAX_SAMPLES));

  vec2 radial = uv - vec2(0.5);
  float radialLen = max(length(radial), 0.0001);
  vec2 radialDir = radial / radialLen;

  vec2 swirl = vec2(
    sin(uTime * 2.3 + uv.y * 24.0),
    cos(uTime * 1.8 - uv.x * 28.0)
  );
  vec2 trailDir = normalize(radialDir + swirl * 0.22);

  vec4 accum = vec4(0.0);
  float totalWeight = 0.0;

  for (int i = 0; i < MAX_SAMPLES; i++) {
    if (float(i) >= sampleCount) {
      break;
    }

    float fi = float(i) / max(sampleCount - 1.0, 1.0);
    float weight = pow(1.0 - fi, 1.35);
    float jitter = 1.0 + sin(uTime * 6.0 + fi * 17.0) * uDispersion;
    vec2 offset = trailDir * fi * fi * uStrength * jitter;

    accum += texture2D(inputBuffer, uv - offset) * weight;
    totalWeight += weight;
  }

  vec4 trail = accum / max(totalWeight, 0.00001);
  float mixAmount = clamp(uStrength * 85.0, 0.0, 1.0);
  outputColor = mix(inputColor, trail, mixAmount);
}
`

export const TemporalFeedbackTrail = forwardRef<
  TemporalFeedbackTrailEffect,
  TemporalFeedbackTrailProps
>(function TemporalFeedbackTrail(
  {
    strength = 0.008,
    dispersion = 0.35,
    samples = 10,
    opacity = 0.4,
    blendFunction = BlendFunction.NORMAL,
  },
  ref,
) {
  const effect = useMemo(
    () =>
      new TemporalFeedbackTrailEffect({
        strength,
        dispersion,
        samples,
        opacity,
        blendFunction,
      }),
    [blendFunction, dispersion, opacity, samples, strength],
  )

  return <primitive ref={ref} object={effect} />
})
