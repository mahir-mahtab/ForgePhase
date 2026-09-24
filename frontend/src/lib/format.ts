const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const

/** Compact file size, e.g. `1.4 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'

  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${BYTE_UNITS[unit]}`
}

/**
 * Metric values span many orders of magnitude -- an MSE near 1e-16 next to a
 * PSNR of 42 -- so pick a notation that stays readable at both ends. NaN is
 * an undefined score (e.g. SNR over pure silence), not negative infinity.
 */
export function formatMetric(value: number): string {
  if (Number.isNaN(value)) return 'n/a'
  if (!Number.isFinite(value)) return value > 0 ? '\u221e' : '\u2212\u221e'
  if (value === 0) return '0'

  const magnitude = Math.abs(value)
  if (magnitude < 1e-3 || magnitude >= 1e6) return value.toExponential(2)
  return value.toFixed(magnitude < 1 ? 4 : 2)
}

/** Turns `noise_20pct` into `Noise 20%` for table rows. */
export function humanizeKey(key: string): string {
  const spaced = key.replaceAll('_', ' ').replace(/(\d+)pct\b/g, '$1%')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
