import { describe, expect, it } from 'vitest'

import {
  FRAME_LENGTH,
  MAX_COLUMNS,
  bandLevel,
  binFrequency,
  computeSpectrogram,
  fft,
  octaveBands,
  wavSampleRate,
} from '@/lib/spectrum'

function sine(hz: number, sampleRate: number, seconds: number, amplitude = 1) {
  const samples = new Float32Array(Math.round(sampleRate * seconds))
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate)
  }
  return samples
}

describe('fft', () => {
  it('puts a cosine in its bin', () => {
    const n = 64
    const re = new Float64Array(n).map((_, i) => Math.cos((2 * Math.PI * 5 * i) / n))
    const im = new Float64Array(n)
    fft(re, im)
    expect(re[5]).toBeCloseTo(n / 2, 6)
    expect(re[n - 5]).toBeCloseTo(n / 2, 6)
    expect(Math.abs(re[4])).toBeLessThan(1e-9)
  })
})

describe('computeSpectrogram', () => {
  it('peaks at the tone and reads about 0 dB at full scale', () => {
    const sampleRate = 16000
    const result = computeSpectrogram(sine(1000, sampleRate, 1), sampleRate)
    let best = 0
    for (let b = 1; b < result.bins; b++) if (result.average[b] > result.average[best]) best = b
    expect(binFrequency(best, result)).toBeCloseTo(1000, -2)
    expect(result.peakDb).toBeGreaterThan(-3)
    expect(result.peakDb).toBeLessThan(1)
    expect(result.bins).toBe(FRAME_LENGTH / 2)
  })

  it('caps the column count for long recordings', () => {
    const result = computeSpectrogram(new Float32Array(16000 * 60), 16000)
    expect(result.columns).toBe(MAX_COLUMNS)
  })

  it('sees a quieter copy as quieter', () => {
    const loud = computeSpectrogram(sine(500, 16000, 1), 16000)
    const quiet = computeSpectrogram(sine(500, 16000, 1, 0.1), 16000)
    expect(bandLevel(loud, 300, 3400) - bandLevel(quiet, 300, 3400)).toBeCloseTo(20, 0)
  })
})

describe('octaveBands', () => {
  it('stops below Nyquist', () => {
    const bands = octaveBands(16000)
    expect(bands[0]?.centre).toBe(63)
    expect(bands.every((band) => band.high <= 8000)).toBe(true)
  })
})

describe('wavSampleRate', () => {
  it('reads the fmt chunk and ignores other files', () => {
    const buffer = new ArrayBuffer(44)
    const view = new DataView(buffer)
    const write = (offset: number, text: string) =>
      [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
    write(0, 'RIFF')
    view.setUint32(4, 36, true)
    write(8, 'WAVE')
    write(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint32(24, 22050, true)
    expect(wavSampleRate(buffer)).toBe(22050)
    expect(wavSampleRate(new ArrayBuffer(8))).toBeNull()
  })
})
