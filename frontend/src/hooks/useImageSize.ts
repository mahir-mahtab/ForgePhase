import { useEffect, useState } from 'react'

export interface ImageSize {
  width: number
  height: number
}

/**
 * Natural pixel size of a picked image file, or null while unknown.
 *
 * Decoding happens off the render path via `createImageBitmap`, and a file
 * the browser cannot decode (e.g. a TIFF) simply stays null -- the backend
 * still validates it.
 */
export function useImageSize(file: File | null): ImageSize | null {
  const [size, setSize] = useState<{ file: File; size: ImageSize } | null>(null)

  useEffect(() => {
    if (!file) return
    let cancelled = false
    createImageBitmap(file)
      .then((bitmap) => {
        if (!cancelled) setSize({ file, size: { width: bitmap.width, height: bitmap.height } })
        bitmap.close()
      })
      .catch(() => {
        // Undecodable in the browser; leave the size unknown.
      })
    return () => {
      cancelled = true
    }
  }, [file])

  // Keyed on the file, so a stale size never shows for a newly picked one.
  return size && size.file === file ? size.size : null
}
