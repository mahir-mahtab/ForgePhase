import { describe, expect, it } from 'vitest'

import { cliCommand, quote } from '@/lib/cli'
import { formatBytes, formatMetric, humanizeKey } from '@/lib/format'
import { PIXEL_LIMITS, pixelLimitMessage } from '@/lib/limits'
import { maskGain } from '@/lib/mask'
import { normalizeReport, parseMetric } from '@/lib/report'
import { searchTools } from '@/lib/navigation'

describe('parseMetric', () => {
  it('parses the strings the API uses for non-finite floats', () => {
    expect(parseMetric('inf')).toBe(Infinity)
    expect(parseMetric('-inf')).toBe(-Infinity)
    expect(parseMetric('nan')).toBeNaN()
    expect(parseMetric(0.5)).toBe(0.5)
    expect(parseMetric('1.25')).toBe(1.25)
    expect(parseMetric(null)).toBeNaN()
  })
})

describe('normalizeReport', () => {
  it('turns the API report into ordered rows', () => {
    const report = normalizeReport({
      kind: 'image',
      report: {
        none: { mse: 0, psnr_db: 'inf', correlation: 1 },
        noise_5pct: { mse: 0.01, psnr_db: 20, correlation: 0.9 },
      },
    })
    expect(report.kind).toBe('image')
    expect(report.rows.map((row) => row.attack)).toEqual(['none', 'noise_5pct'])
    expect(report.rows[0]?.metrics.psnr_db).toBe(Infinity)
  })

  it('rejects an unexpected shape', () => {
    expect(() => normalizeReport({ kind: 'video', report: {} })).toThrow()
    expect(() => normalizeReport(null)).toThrow()
  })
})

describe('formatMetric', () => {
  it('distinguishes NaN from negative infinity', () => {
    expect(formatMetric(NaN)).toBe('n/a')
    expect(formatMetric(-Infinity)).toBe('−∞')
    expect(formatMetric(Infinity)).toBe('∞')
  })

  it('keeps tiny and large values readable', () => {
    expect(formatMetric(0)).toBe('0')
    expect(formatMetric(1e-16)).toBe('1.00e-16')
    expect(formatMetric(0.98765)).toBe('0.9877')
    expect(formatMetric(42.123)).toBe('42.12')
  })
})

describe('format helpers', () => {
  it('formats byte counts', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('humanizes attack keys', () => {
    expect(humanizeKey('noise_20pct')).toBe('Noise 20%')
  })
})

describe('cliCommand', () => {
  it('quotes arguments the shell would split or expand', () => {
    expect(cliCommand('phaseforge', 'filter', 'my photo.png', 'out.png')).toBe(
      'phaseforge filter "my photo.png" out.png',
    )
    expect(quote('a$b')).toBe('"a\\$b"')
    expect(quote('say "hi"')).toBe('"say \\"hi\\""')
    expect(quote('<input>')).toBe('"<input>"')
  })

  it('drops disabled parts and keeps numbers', () => {
    expect(cliCommand('x', false, null, undefined, '', '--size', 64)).toBe('x --size 64')
  })
})

describe('maskGain', () => {
  it('matches the backend mask definitions', () => {
    const base = { cutoff: 0.3, highCutoff: null, order: 2 }
    expect(maskGain(0, { ...base, kind: 'low', shape: 'gaussian' })).toBe(1)
    expect(maskGain(0.3, { ...base, kind: 'low', shape: 'butterworth' })).toBeCloseTo(0.5)
    expect(maskGain(0.31, { ...base, kind: 'high', shape: 'ideal' })).toBe(1)
    expect(maskGain(0.5, { ...base, kind: 'band', shape: 'ideal', highCutoff: 0.6 })).toBe(1)
  })
})

describe('pixelLimitMessage', () => {
  it('accepts an image at the limit', () => {
    expect(pixelLimitMessage(1024, 1024, PIXEL_LIMITS.encrypt)).toBeNull()
  })

  it('suggests a same-shape size that fits', () => {
    const message = pixelLimitMessage(1200, 2133, PIXEL_LIMITS.encrypt)
    expect(message).toContain('1200 × 2133')
    const [, width, height] = /to (\d+) × (\d+)/.exec(message ?? '') ?? []
    expect(Number(width) * Number(height)).toBeLessThanOrEqual(PIXEL_LIMITS.encrypt)
  })
})

describe('searchTools', () => {
  it('returns empty array when query is blank or whitespace', () => {
    expect(searchTools('')).toEqual([])
    expect(searchTools('   ')).toEqual([])
  })

  it('finds tools by exact or partial label case-insensitively', () => {
    const results = searchTools('denoise')
    expect(results).toHaveLength(1)
    expect(results[0]?.tool.value).toBe('denoise')
    expect(results[0]?.domain).toBe('audio')

    const encrypts = searchTools('encrypt')
    expect(encrypts).toHaveLength(2)
    expect(encrypts.map((r) => r.domain)).toEqual(['image', 'audio'])
  })

  it('finds tools by description content', () => {
    const radial = searchTools('radial mask')
    expect(radial).toHaveLength(1)
    expect(radial[0]?.tool.value).toBe('filter')
    expect(radial[0]?.domain).toBe('image')

    const speech = searchTools('speech')
    expect(speech).toHaveLength(1)
    expect(speech[0]?.tool.value).toBe('enhance')
  })

  it('finds all tools in a domain when domain name is searched', () => {
    const audioResults = searchTools('Audio')
    expect(audioResults.length).toBeGreaterThanOrEqual(5)
  })

  it('returns empty array when no tools match query', () => {
    expect(searchTools('nonexistent-term-xyz')).toEqual([])
  })
})

