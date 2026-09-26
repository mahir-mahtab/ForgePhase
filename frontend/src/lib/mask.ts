import type { FilterKind, FilterShape } from '@/services/types'

/**
 * Client-side port of `freq_edit.build_mask`.
 *
 * The mask is a pure function of normalised radius, so the browser can draw
 * exactly the filter the backend would build without a round trip. Keep this
 * in step with the Python: the whole point is that the preview is not an
 * impression of the filter, it is the filter.
 */

export interface MaskParams {
  kind: FilterKind
  cutoff: number
  highCutoff: number | null
  shape: FilterShape
  order: number
}

/** The corner of a square spectrum sits at sqrt(2) once the radius is normalised. */
export const MAX_RADIUS = Math.SQRT2

function lowPass(radius: number, limit: number, shape: FilterShape, order: number) {
  if (shape === 'ideal') return radius <= limit ? 1 : 0
  if (shape === 'gaussian') return Math.exp(-(radius * radius) / (2 * limit * limit))
  return 1 / (1 + Math.pow(radius / limit, 2 * order))
}

/** Gain in [0, 1] at a normalised radius, where 0 is DC. */
export function maskGain(radius: number, params: MaskParams): number {
  const { kind, cutoff, highCutoff, shape, order } = params

  if (cutoff <= 0) return kind === 'high' ? 1 : 0

  if (kind === 'low') return lowPass(radius, cutoff, shape, order)
  if (kind === 'high') return 1 - lowPass(radius, cutoff, shape, order)

  // Band-pass is the difference of two low-passes, and is undefined until the
  // upper edge clears the lower one.
  if (highCutoff === null || highCutoff <= cutoff) return 0
  return (
    lowPass(radius, highCutoff, shape, order) -
    lowPass(radius, cutoff, shape, order)
  )
}

/**
 * Samples the mask across the radius. One allocation per parameter change,
 * reused by both the ring field and the profile trace.
 */
export function sampleProfile(params: MaskParams, steps: number): Float32Array {
  const out = new Float32Array(steps)
  for (let i = 0; i < steps; i += 1) {
    out[i] = maskGain((i / (steps - 1)) * MAX_RADIUS, params)
  }
  return out
}

/**
 * Fraction of spectral energy the mask lets through, weighted by how many bins
 * sit at each radius. A flat readout of what the filter actually costs.
 */
export function passBandFraction(profile: Float32Array): number {
  let passed = 0
  let total = 0
  for (let i = 0; i < profile.length; i += 1) {
    // Bins at radius r grow with r, so weight each sample by its own radius.
    const weight = i
    passed += (profile[i] ?? 0) * weight
    total += weight
  }
  return total === 0 ? 0 : passed / total
}

/**
 * Radius where the mask first crosses half gain, in either direction, or null
 * if it never does. A low-pass starts at full gain and falls, a high-pass
 * rises, and a band-pass does both -- so the crossing has no fixed direction.
 */
export function halfGainRadius(profile: Float32Array): number | null {
  for (let i = 1; i < profile.length; i += 1) {
    const previous = profile[i - 1] ?? 0
    const current = profile[i] ?? 0
    const crossed =
      (previous < 0.5 && current >= 0.5) || (previous >= 0.5 && current < 0.5)
    if (!crossed) continue

    // Interpolate within the step rather than snapping to the sample grid.
    const span = current - previous
    const fraction = span === 0 ? 0 : (0.5 - previous) / span
    return ((i - 1 + fraction) / (profile.length - 1)) * MAX_RADIUS
  }
  return null
}
