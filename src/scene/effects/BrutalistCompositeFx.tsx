import { forwardRef, useMemo } from 'react'
import { BlendFunction, Effect } from 'postprocessing'
import { Uniform, Vector2, WebGLRenderTarget, WebGLRenderer } from 'three'

type BrutalistCompositeFxProps = {
  posterizeSteps?: number
  edgeStrength?: number
  ditherStrength?: number
  grain?: number
  warp?: number
  opacity?: number
  blendFunction?: BlendFunction
}

class BrutalistCompositeEffect extends Effect {
  constructor({
    posterizeSteps = 7,
    edgeStrength = 1.1,
    ditherStrength = 0.18,
    grain = 0.03,
    warp = 0.12,
    opacity = 0.45,
    blendFunction = BlendFunction.SOFT_LIGHT,
  }: Required<BrutalistCompositeFxProps>) {
    super('BrutalistCompositeEffect', fragmentShader, {
      blendFunction,
      uniforms: new Map<string, Uniform<unknown>>([
        ['uPosterizeSteps', new Uniform(Math.max(2, posterizeSteps))],
        ['uEdgeStrength', new Uniform(Math.max(0, edgeStrength))],
        ['uDitherStrength', new Uniform(Math.max(0, ditherStrength))],
        ['uGrain', new Uniform(Math.max(0, grain))],
        ['uWarp', new Uniform(Math.max(0, warp))],
        ['uTexelSize', new Uniform(new Vector2(1 / 1024, 1 / 1024))],
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

  override setSize(width: number, height: number): void {
    const texelUniform = this.uniforms.get('uTexelSize') as Uniform<Vector2> | undefined
    if (texelUniform && width > 0 && height > 0) {
      texelUniform.value.set(1 / width, 1 / height)
    }
  }
}

const fragmentShader = /* glsl */ `
uniform float uPosterizeSteps;
uniform float uEdgeStrength;
uniform float uDitherStrength;
uniform float uGrain;
uniform float uWarp;
uniform vec2 uTexelSize;
uniform float uTime;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 warpOffset = vec2(
    sin(uv.y * 36.0 + uTime * 1.65),
    cos(uv.x * 30.0 - uTime * 1.21)
  ) * (uWarp * 0.0024);

  vec2 uv0 = uv + warpOffset;
  vec4 source = texture2D(inputBuffer, uv0);
  vec3 color = source.rgb;

  vec3 left = texture2D(inputBuffer, uv0 - vec2(uTexelSize.x, 0.0)).rgb;
  vec3 right = texture2D(inputBuffer, uv0 + vec2(uTexelSize.x, 0.0)).rgb;
  vec3 up = texture2D(inputBuffer, uv0 + vec2(0.0, uTexelSize.y)).rgb;
  vec3 down = texture2D(inputBuffer, uv0 - vec2(0.0, uTexelSize.y)).rgb;

  float edge = abs(luma(left) - luma(right)) + abs(luma(up) - luma(down));
  edge = smoothstep(0.08, 0.45, edge) * uEdgeStrength;

  float steps = max(2.0, uPosterizeSteps);
  float noise = hash21(uv0 * 1900.0 + vec2(uTime * 17.0, uTime * 9.0)) - 0.5;
  vec3 posterized = floor(color * steps + noise * uDitherStrength) / (steps - 1.0);
  posterized = clamp(posterized, 0.0, 1.0);

  float grainNoise = hash21(uv0 * 1300.0 + vec2(uTime * 37.0, uTime * 61.0)) - 0.5;
  vec3 edged = posterized + vec3(edge) * 0.22;
  vec3 finalColor = edged + grainNoise * uGrain;

  outputColor = vec4(clamp(finalColor, 0.0, 1.0), inputColor.a);
}
`

export const BrutalistCompositeFx = forwardRef<
  BrutalistCompositeEffect,
  BrutalistCompositeFxProps
>(function BrutalistCompositeFx(
  {
    posterizeSteps = 7,
    edgeStrength = 1.1,
    ditherStrength = 0.18,
    grain = 0.03,
    warp = 0.12,
    opacity = 0.45,
    blendFunction = BlendFunction.SOFT_LIGHT,
  },
  ref,
) {
  const effect = useMemo(
    () =>
      new BrutalistCompositeEffect({
        posterizeSteps,
        edgeStrength,
        ditherStrength,
        grain,
        warp,
        opacity,
        blendFunction,
      }),
    [
      blendFunction,
      ditherStrength,
      edgeStrength,
      grain,
      opacity,
      posterizeSteps,
      warp,
    ],
  )

  return <primitive ref={ref} object={effect} />
})
