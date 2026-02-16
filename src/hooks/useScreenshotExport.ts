import { useThree } from '@react-three/fiber'
import { useCallback, useRef } from 'react'

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function createFilename(scale: number): string {
  const stamp = new Date().toISOString().replace(/[.:]/g, '-')
  return `type-collapse-${scale}x-${stamp}.png`
}

export function useScreenshotExport() {
  const { gl, size, invalidate } = useThree()
  const isCapturingRef = useRef(false)

  return useCallback(
    async (scale = 1) => {
      if (isCapturingRef.current) {
        return
      }

      isCapturingRef.current = true

      const safeScale = Math.min(Math.max(Math.round(scale), 1), 3)
      const currentPixelRatio = gl.getPixelRatio()

      try {
        gl.setPixelRatio(currentPixelRatio * safeScale)
        gl.setSize(size.width, size.height, false)
        invalidate()

        await waitForAnimationFrame()

        const pngDataUrl = gl.domElement.toDataURL('image/png')
        const downloadLink = document.createElement('a')
        downloadLink.href = pngDataUrl
        downloadLink.download = createFilename(safeScale)
        downloadLink.click()
      } finally {
        gl.setPixelRatio(currentPixelRatio)
        gl.setSize(size.width, size.height, false)
        invalidate()
        isCapturingRef.current = false
      }
    },
    [gl, invalidate, size.height, size.width],
  )
}
