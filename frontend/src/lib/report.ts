import type { DomainKind, RobustnessReport } from '@/services/types'

/**
 * JSON cannot carry infinities or NaN, so the API sends them as the strings
 * Python's `str(float)` produces. Parse them back into real numbers so the
 * table can tell a perfect reconstruction (inf) from an undefined one (nan).
 */
export function parseMetric(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase()
    if (lower === 'inf' || lower === 'infinity') return Infinity
    if (lower === '-inf' || lower === '-infinity') return -Infinity
    if (lower === 'nan') return NaN
    const parsed = Number(lower)
    return Number.isNaN(parsed) ? NaN : parsed
  }
  return NaN
}

/** Turns the API's `{kind, report: {attack: metrics}}` into ordered rows. */
export function normalizeReport(raw: unknown): RobustnessReport {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('The robustness report was not an object.')
  }
  const { kind, report } = raw as { kind?: unknown; report?: unknown }
  if ((kind !== 'image' && kind !== 'audio') || typeof report !== 'object' || report === null) {
    throw new Error('The robustness report had an unexpected shape.')
  }

  const rows = Object.entries(report as Record<string, unknown>).map(
    ([attack, metrics]) => ({
      attack,
      metrics: Object.fromEntries(
        Object.entries((metrics ?? {}) as Record<string, unknown>).map(([key, value]) => [
          key,
          parseMetric(value),
        ]),
      ),
    }),
  )
  return { kind: kind as DomainKind, rows }
}
