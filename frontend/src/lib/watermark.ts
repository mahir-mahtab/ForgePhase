/**
 * Client-side port of `watermark.position_range`.
 *
 * The mark must sit entirely in the upper half of the shifted spectrum so it
 * never overlaps its own Hermitian mirror; this returns the `position` values
 * the backend will accept for a given image and watermark, or null when the
 * mark cannot fit at all. Keep in step with `phaseforge/image/watermark.py`.
 */
export function positionRange(
  imageHeight: number,
  imageWidth: number,
  markHeight: number,
  markWidth: number,
): { min: number; max: number } | null {
  if (markHeight < 1 || markWidth < 1 || markWidth > imageWidth) return null

  const half = Math.floor(imageHeight / 2)
  const top = imageHeight % 2 === 0 ? 1 : 0
  let low: number | null = null
  let high: number | null = null
  for (let offset = 0; offset <= imageHeight; offset += 1) {
    const row = half - offset - Math.floor(markHeight / 2)
    if (row >= top && row + markHeight <= half) {
      low ??= offset
      high = offset
    }
  }
  if (low === null || high === null) return null
  // int(position * height) == offset for position in [offset/h, (offset+1)/h).
  return { min: low / imageHeight, max: (high + 1) / imageHeight - 1e-9 }
}
