import { useThree } from '@react-three/fiber'
import { Color } from 'three'
import { useCallback, useRef } from 'react'

type CaptureLifecycle = {
  onBeforeCapture?: () => Promise<void> | void
  onAfterCapture?: () => Promise<void> | void
}

export type ScreenshotExportOptions = CaptureLifecycle & {
  scale?: number
  transparentBackground?: boolean
  filenamePrefix?: string
}

export type SequenceExportOptions = CaptureLifecycle & {
  scale?: number
  transparentBackground?: boolean
  filenamePrefix?: string
  durationSeconds?: number
  fps?: number
  framePadding?: number
}

type DirectoryWritable = {
  write: (data: Blob) => Promise<void>
  close: () => Promise<void>
}

type DirectoryFileHandle = {
  createWritable: () => Promise<DirectoryWritable>
}

type DirectoryHandle = {
  getFileHandle: (
    name: string,
    options: { create: boolean },
  ) => Promise<DirectoryFileHandle>
}

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: () => Promise<DirectoryHandle>
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function toPaddedFrame(frame: number, padding: number): string {
  return String(frame).padStart(padding, '0')
}

function timestamp(): string {
  return new Date().toISOString().replace(/[.:]/g, '-')
}

function createScreenshotFilename(
  prefix: string,
  scale: number,
  transparentBackground: boolean,
): string {
  const alpha = transparentBackground ? 'alpha' : 'opaque'
  return `${prefix}-${scale}x-${alpha}-${timestamp()}.png`
}

function createSequenceFrameName(
  prefix: string,
  frame: number,
  padding: number,
): string {
  return `${prefix}_${toPaddedFrame(frame, padding)}.png`
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas export failed: toBlob returned null.'))
        return
      }

      resolve(blob)
    }, 'image/png')
  })
}

async function writeBlobToDirectory(
  directoryHandle: DirectoryHandle,
  filename: string,
  blob: Blob,
): Promise<void> {
  const fileHandle = await directoryHandle.getFileHandle(filename, {
    create: true,
  })
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()
}

export function useScreenshotExport() {
  const { gl, size, invalidate, frameloop, setFrameloop, advance } = useThree()
  const isCapturingRef = useRef(false)

  const runCaptureLifecycle = useCallback(
    async (lifecycle: CaptureLifecycle, phase: 'before' | 'after') => {
      if (phase === 'before') {
        await lifecycle.onBeforeCapture?.()
      } else {
        await lifecycle.onAfterCapture?.()
      }
    },
    [],
  )

  const withCaptureContext = useCallback(
    async (
      options: {
        scale: number
        transparentBackground: boolean
      } & CaptureLifecycle,
      run: () => Promise<void>,
    ) => {
      const safeScale = Math.min(Math.max(Math.round(options.scale), 1), 4)
      const currentPixelRatio = gl.getPixelRatio()
      const clearColor = gl.getClearColor(new Color())
      const clearAlpha = gl.getClearAlpha()

      await runCaptureLifecycle(options, 'before')

      try {
        if (options.transparentBackground) {
          gl.setClearAlpha(0)
        }

        gl.setPixelRatio(currentPixelRatio * safeScale)
        gl.setSize(size.width, size.height, false)
        invalidate()
        await waitForAnimationFrame()

        await run()
      } finally {
        gl.setClearColor(clearColor, clearAlpha)
        gl.setPixelRatio(currentPixelRatio)
        gl.setSize(size.width, size.height, false)
        invalidate()
        await runCaptureLifecycle(options, 'after')
        isCapturingRef.current = false
      }
    },
    [gl, invalidate, runCaptureLifecycle, size.height, size.width],
  )

  const exportScreenshot = useCallback(
    async (options?: ScreenshotExportOptions) => {
      if (isCapturingRef.current) {
        return
      }

      isCapturingRef.current = true

      const scale = options?.scale ?? 1
      const transparentBackground = options?.transparentBackground ?? false
      const safeScale = Math.min(Math.max(Math.round(scale), 1), 4)
      const prefix = options?.filenamePrefix?.trim() || 'type-collapse'

      await withCaptureContext(
        {
          scale: safeScale,
          transparentBackground,
          onBeforeCapture: options?.onBeforeCapture,
          onAfterCapture: options?.onAfterCapture,
        },
        async () => {
          const blob = await canvasToBlob(gl.domElement)
          const filename = createScreenshotFilename(
            prefix,
            safeScale,
            transparentBackground,
          )
          downloadBlob(blob, filename)
        },
      )
    },
    [gl.domElement, withCaptureContext],
  )

  const exportSequence = useCallback(
    async (options?: SequenceExportOptions) => {
      if (isCapturingRef.current) {
        return
      }

      isCapturingRef.current = true

      const scale = options?.scale ?? 1
      const safeScale = Math.min(Math.max(Math.round(scale), 1), 4)
      const transparentBackground = options?.transparentBackground ?? false
      const fps = Math.min(Math.max(options?.fps ?? 24, 1), 120)
      const durationSeconds = Math.min(
        Math.max(options?.durationSeconds ?? 4, 0.25),
        120,
      )
      const frameCount = Math.max(1, Math.round(durationSeconds * fps))
      const framePadding = Math.min(
        Math.max(Math.round(options?.framePadding ?? 4), 2),
        8,
      )
      const prefixBase = options?.filenamePrefix?.trim() || 'type-collapse-seq'
      const prefix = `${prefixBase}-${timestamp()}`
      const frameDurationMs = 1000 / fps

      const typedWindow = window as WindowWithDirectoryPicker
      let directoryHandle: DirectoryHandle | null = null

      if (typedWindow.showDirectoryPicker) {
        try {
          directoryHandle = await typedWindow.showDirectoryPicker()
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            isCapturingRef.current = false
            return
          }
          throw error
        }
      }

      if (!directoryHandle && frameCount > 80) {
        const shouldContinue = window.confirm(
          'This browser may prompt many downloads. Continue sequence export?',
        )
        if (!shouldContinue) {
          isCapturingRef.current = false
          return
        }
      }

      const previousFrameloop = frameloop
      setFrameloop('never')

      try {
        await withCaptureContext(
          {
            scale: safeScale,
            transparentBackground,
            onBeforeCapture: options?.onBeforeCapture,
            onAfterCapture: options?.onAfterCapture,
          },
          async () => {
            const captureStart = performance.now()

            for (let frame = 1; frame <= frameCount; frame += 1) {
              const timestamp = captureStart + (frame - 1) * frameDurationMs

              // Deterministic step: one fixed simulation tick per exported frame.
              advance(timestamp, true)

              const blob = await canvasToBlob(gl.domElement)
              const filename = createSequenceFrameName(prefix, frame, framePadding)

              if (directoryHandle) {
                await writeBlobToDirectory(directoryHandle, filename, blob)
              } else {
                downloadBlob(blob, filename)
              }
            }
          },
        )
      } finally {
        setFrameloop(previousFrameloop)
      }
    },
    [
      advance,
      frameloop,
      gl.domElement,
      setFrameloop,
      withCaptureContext,
    ],
  )

  return { exportScreenshot, exportSequence }
}
