# Type Collapse

Type Collapse is an interactive 3D text-destruction web app built with React, React Three Fiber, and Three.js. It is designed for experimental visuals, live parameter exploration, and export workflows for social/video content.

The experience combines:
- Procedural vertex distortion with pointer interaction and automation modes
- Emissive velocity-driven color shifts inspired by TSL-style workflows
- Cinematic and brutalist post-processing stacks
- GSAP timeline camera choreography
- Leva-based live controls for nearly every system

## Demo focus

This project targets a brutalist / avant-garde visual style with production-friendly controls:
- Dynamic text + font switching
- Distortion character modes (`Organic`, `Shear`, `Rip`, `Crunch`, `Melt`)
- Distortion automation (`Sweep`, `BPM Buzz`)
- Click-to-freeze simulation while keeping rendering/orbit active
- Screenshot export + PNG frame-sequence export
- Transparent background export options

## Tech stack

- React 19 + TypeScript
- Vite
- `@react-three/fiber` + `three`
- `@react-three/drei`
- `@react-three/postprocessing` + `postprocessing`
- GSAP
- Leva

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Start development server

```bash
npm run dev
```

### 3. Build for production

```bash
npm run build
```

### 4. Preview production build

```bash
npm run preview
```

## Available scripts

- `npm run dev` - start Vite dev server
- `npm run build` - run TypeScript build + Vite production build
- `npm run preview` - preview the production build locally
- `npm run lint` - run ESLint
- `npm run font:convert` - convert TTF/OTF to Three.js typeface JSON

## Runtime controls (Leva)

The control panel includes grouped systems such as:
- `Playback` - pause/resume and reseed
- `Text` - content, auto regen/manual regen, font, bevel, geometry detail
- `Distortion` - noise, spring/friction, emissive response, material, character mode
- `Distortion Automation` - sweep path and BPM buzz behavior
- `Post FX` - bloom, DOF, motion blur, glitch, pixelation, scanline, color depth, custom effects
- `Environment` - background, fog, ground plane
- `Timeline` - GSAP camera choreography and parameter sweeps
- `Look Presets` - one-click styled setups
- `Export` - resolution scale, transparency, screenshots, PNG sequences

## Loading behavior

The app includes a fullscreen loading overlay that:
- Uses a red background
- Accepts a `visible` prop (`LoadingScreen` component)
- Stays visible for at least 2 seconds
- Remains visible longer if the scene is not ready

## Export workflow

Exports are configured from the `Export` folder in Leva:
- Single screenshot (1x/2x/3x/4x scaling)
- PNG sequence export with duration/FPS/padding/prefix
- Transparent background mode
- Optional fog disable during transparent captures

Sequence export uses deterministic frame stepping to reduce timing drift between frames.

## Project structure

```text
src/
  App.tsx
  App.css
  index.css
  components/
    LoadingScreen.tsx
  config/
    levaTheme.ts
  data/
    fonts.ts
  hooks/
    useScreenshotExport.ts
  scene/
    ElasticText.tsx
    TextDestructionExperience.tsx
    effects/
      BrutalistCompositeFx.tsx
      CinematicMotionBlur.tsx
      TemporalFeedbackTrail.tsx
```

## Adding custom 3D fonts

`Text3D` requires Three.js `typeface.json` font files.

1. Place source font locally (example: `.tmp/fonts-src/MyFont.ttf`)
2. Convert it:

```bash
npm run font:convert -- .tmp/fonts-src/MyFont.ttf public/fonts/my_font.typeface.json
```

3. Register the new font in `src/data/fonts.ts`

Notes:
- Both `.ttf` and `.otf` are supported
- Complex fonts can generate heavy geometry and reduce framerate

## Performance notes

- Post-processing stacks can be expensive at high DPR and high export scales
- Dense text geometry (large bevel/curve segments + complex fonts) increases CPU/GPU load
- For smoother live operation, lower `curveSegments`, bloom intensity, and heavy FX pass count

## License

Private project unless you add a license file.
