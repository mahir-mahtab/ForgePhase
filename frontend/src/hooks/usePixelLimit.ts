import { useImageSize } from '@/hooks/useImageSize'
import { pixelLimitMessage } from '@/lib/limits'

/**
 * Whether a picked image is over a tool's pixel limit. An unknown size (no
 * file yet, or one the browser cannot decode) never blocks: the backend
 * checks too.
 */
export function usePixelLimit(file: File | null, limit: number): string | null {
  const size = useImageSize(file)
  return size ? pixelLimitMessage(size.width, size.height, limit) : null
}
