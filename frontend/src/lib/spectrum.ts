/**
 * Browser-side spectral analysis for the audio before/after views.
 *
 * The backend returns only the processed WAV, so the spectrogram and the
 * long-term average spectrum are computed here from the decoded samples of
 * both files. Kept free of DOM access (apart from `decodeAudio`) so the maths
 * can be unit tested.
 */

/** Frame length for display; ~23 ms at 44.1 kHz, fine enough for pitch harmonics. */
export const FRAME_LENGTH = 1024
/** At most this many spectrogram columns, whatever the recording's length. */
export const MAX_COLUMNS = 480
/** Dynamic range shown, below the loudest bin of either file. */
export const DISPLAY_RANGE_DB = 90

export interface Spectrogram {
  sampleRate: number
  duration: number
  columns: number
  /** Bins from DC up to (not including) Nyquist: `FRAME_LENGTH / 2`. */
  bins: number
  /** Power in dB, column-major: `db[column * bins + bin]`. */
  db: Float32Array
  /** Long-term average spectrum in dB, one value per bin. */
  average: Float32Array
  /** Loudest bin anywhere, in dB. */
  peakDb: number
  /** Mean level of the quietest 10 % of frames: the background. */
  floorDb: number
}

const EPSILON = 1e-20

function toDb(power: number) {
  return 10 * Math.log10(power + EPSILON)
}

/** In-place iterative radix-2 FFT; `re.length` must be a power of two. */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size
    const half = size >> 1
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const cos = Math.cos(step * k)
        const sin = Math.sin(step * k)
        const a = start + k
        const b = a + half
        const tr = re[b] * cos - im[b] * sin
        const ti = re[b] * sin + im[b] * cos
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
}

/** STFT magnitudes in dB, decimated in time to at most `MAX_COLUMNS` columns. */
export function computeSpectrogram(samples: Float32Array, sampleRate: number): Spectrogram {
  const bins = FRAME_LENGTH / 2
  const frames = Math.max(1, Math.ceil((samples.length - FRAME_LENGTH) / (FRAME_LENGTH / 4)) + 1)
  const columns = Math.min(frames, MAX_COLUMNS)
  const hop = columns > 1 ? Math.max(1, (samples.length - FRAME_LENGTH) / (columns - 1)) : 0

  const window = new Float64Array(FRAME_LENGTH)
  let windowSum = 0
  for (let i = 0; i < FRAME_LENGTH; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME_LENGTH)
    windowSum += window[i]
  }
  // Undo the window's coherent gain, so a full-scale sine peaks at about 0 dB.
  const scale = 4 / (windowSum * windowSum)

  const db = new Float32Array(columns * bins)
  const sumPower = new Float64Array(bins)
  const frameEnergy = new Float64Array(columns)
  const re = new Float64Array(FRAME_LENGTH)
  const im = new Float64Array(FRAME_LENGTH)
  let peakDb = -Infinity

  for (let c = 0; c < columns; c++) {
    const start = Math.round(c * hop)
    for (let i = 0; i < FRAME_LENGTH; i++) {
      re[i] = (samples[start + i] ?? 0) * window[i]
      im[i] = 0
    }
    fft(re, im)
    let energy = 0
    for (let b = 0; b < bins; b++) {
      const power = (re[b] * re[b] + im[b] * im[b]) * scale
      sumPower[b] += power
      energy += power
      const value = toDb(power)
      db[c * bins + b] = value
      if (value > peakDb) peakDb = value
    }
    frameEnergy[c] = energy
  }

  const average = new Float32Array(bins)
  for (let b = 0; b < bins; b++) average[b] = toDb(sumPower[b] / columns)

  const sorted = Array.from(frameEnergy).sort((a, b) => a - b)
  const quiet = sorted.slice(0, Math.max(1, Math.floor(columns / 10)))
  const floorDb = toDb(quiet.reduce((sum, value) => sum + value, 0) / quiet.length)

  return {
    sampleRate,
    duration: samples.length / sampleRate,
    columns,
    bins,
    db,
    average,
    peakDb,
    floorDb,
  }
}

/** Frequency in Hz at the centre of `bin`. */
export function binFrequency(bin: number, spectrogram: Pick<Spectrogram, 'sampleRate'>) {
  return (bin * spectrogram.sampleRate) / FRAME_LENGTH
}

/** Mean dB of the average spectrum inside `[low, high)` Hz, averaged in power. */
export function bandLevel(spectrogram: Spectrogram, low: number, high: number) {
  let sum = 0
  let count = 0
  for (let b = 0; b < spectrogram.bins; b++) {
    const f = binFrequency(b, spectrogram)
    if (f >= low && f < high) {
      sum += 10 ** (spectrogram.average[b] / 10)
      count++
    }
  }
  return count ? toDb(sum / count) : -Infinity
}

/** Octave bands (centre frequencies) that fit under Nyquist, for the table view. */
export function octaveBands(sampleRate: number) {
  const bands: Array<{ centre: number; low: number; high: number }> = []
  for (let centre = 63; centre * Math.SQRT2 <= sampleRate / 2; centre *= 2) {
    bands.push({ centre, low: centre / Math.SQRT2, high: centre * Math.SQRT2 })
  }
  return bands
}

/** The sample rate in a RIFF/WAVE `fmt ` chunk, or `null` for anything else. */
export function wavSampleRate(bytes: ArrayBuffer): number | null {
  const view = new DataView(bytes)
  const tag = (offset: number) =>
    offset + 4 <= view.byteLength
      ? String.fromCharCode(...new Uint8Array(bytes, offset, 4))
      : ''
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null
  for (let offset = 12; offset + 8 <= view.byteLength; ) {
    const size = view.getUint32(offset + 4, true)
    if (tag(offset) === 'fmt ' && offset + 16 <= view.byteLength) {
      return view.getUint32(offset + 12, true)
    }
    offset += 8 + size + (size % 2)
  }
  return null
}

/**
 * Decode any browser-playable audio file to mono samples.
 *
 * Browsers resample to the decoding context's rate, so for WAV the context is
 * opened at the file's own rate; otherwise the frequency axis would stretch
 * past the recording's real Nyquist limit.
 */
export async function decodeAudio(file: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const bytes = await file.arrayBuffer()
  const native = wavSampleRate(bytes)
  const rate = native !== null && native >= 3000 && native <= 768000 ? native : 44100
  const context = new OfflineAudioContext(1, 1, rate)
  const buffer = await context.decodeAudioData(bytes)
  const samples = new Float32Array(buffer.length)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < data.length; i++) samples[i] += data[i] / buffer.numberOfChannels
  }
  return { samples, sampleRate: buffer.sampleRate }
}
