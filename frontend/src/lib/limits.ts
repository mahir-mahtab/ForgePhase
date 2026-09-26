/**
 * Client-side copy of the backend's image size limits in
 * `phaseforge/api/support.py`, so an oversized image is flagged before it is
 * uploaded. The backend still enforces them. Keep in step with
 * `MAX_IMAGE_PIXELS` and `MAX_EDIT_PIXELS`.
 */
export const PIXEL_LIMITS = {
  /** Encryption pads each axis to a power of two, so it takes the least. */
  encrypt: 1024 * 1024,
  /** Watermark, filter and spectrum work at the image's own size. */
  edit: 4 * 1024 * 1024,
} as const

/** Why an image of this size cannot be used, or null when it fits. */
export function pixelLimitMessage(width: number, height: number, limit: number): string | null {
  if (width * height <= limit) return null
  // Largest same-shape size that fits, rounded down so it really does.
  const scale = Math.sqrt(limit / (width * height))
  const fitWidth = Math.floor(width * scale)
  const fitHeight = Math.floor(height * scale)
  return (
    `This image is ${width} × ${height}, over the ${(limit / 1_048_576).toFixed(0)} megapixel ` +
    `limit for this tool. Resize it to ${fitWidth} × ${fitHeight} or smaller.`
  )
}
