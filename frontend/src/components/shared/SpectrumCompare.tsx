import { Loader2 } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { useTheme } from '@/hooks/useTheme'
import {
  DISPLAY_RANGE_DB,
  FRAME_LENGTH,
  type Spectrogram,
  bandLevel,
  binFrequency,
  computeSpectrogram,
  decodeAudio,
  octaveBands,
} from '@/lib/spectrum'

interface SpectrumCompareProps {
  input: File
  output: File
  /** Names the processed file in legends, e.g. "Denoised". */
  outputLabel: string
}

type Analysis =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; input: Spectrogram; output: Spectrogram }

function useAnalysis(input: File, output: File): Analysis {
  const [state, setState] = useState<{ key: [File, File]; analysis: Analysis } | null>(null)

  useEffect(() => {
    let cancelled = false
    const analyse = async (file: File) => {
      const { samples, sampleRate } = await decodeAudio(file)
      return computeSpectrogram(samples, sampleRate)
    }
    Promise.all([analyse(input), analyse(output)])
      .then(([a, b]) => {
        if (!cancelled) setState({ key: [input, output], analysis: { phase: 'ready', input: a, output: b } })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          key: [input, output],
          analysis: {
            phase: 'error',
            message: error instanceof Error ? error.message : 'Could not decode the audio.',
          },
        })
      })
    return () => {
      cancelled = true
    }
  }, [input, output])

  // A stale result for other files reads as still loading.
  if (!state || state.key[0] !== input || state.key[1] !== output) return { phase: 'loading' }
  return state.analysis
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

function formatHz(hz: number) {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz`
  return `${Math.round(hz)} Hz`
}

function formatDb(db: number) {
  return Number.isFinite(db) ? `${db.toFixed(1).replace('-', '−')} dB` : '—'
}

function formatChange(db: number) {
  if (!Number.isFinite(db)) return '—'
  const sign = db > 0.05 ? '+' : db < -0.05 ? '−' : '±'
  return `${sign}${Math.abs(db).toFixed(1)} dB`
}

/* -------------------------------------------------------------------------- */
/* Colour ramp                                                                 */
/* -------------------------------------------------------------------------- */

type Rgb = [number, number, number]

function parseHex(value: string, fallback: Rgb): Rgb {
  const hex = value.trim().replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
}

/** Single-hue sequential ramp, surface to primary, in 256 steps. */
function buildRamp(low: Rgb, high: Rgb) {
  const ramp = new Uint8ClampedArray(256 * 3)
  const toLinear = (c: number) => (c / 255) ** 2.2
  const toSrgb = (c: number) => 255 * c ** (1 / 2.2)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    for (let k = 0; k < 3; k++) {
      ramp[i * 3 + k] = toSrgb(toLinear(low[k]) + (toLinear(high[k]) - toLinear(low[k])) * t)
    }
  }
  return ramp
}

function useRamp() {
  const { theme } = useTheme()
  return useMemo(() => {
    const styles = getComputedStyle(document.documentElement)
    const dark = theme === 'dark'
    const low = parseHex(styles.getPropertyValue('--plate'), dark ? [18, 19, 16] : [245, 244, 230])
    const high = parseHex(styles.getPropertyValue('--primary'), dark ? [111, 208, 182] : [3, 79, 70])
    return { ramp: buildRamp(low, high), low, high }
  }, [theme])
}

/* -------------------------------------------------------------------------- */
/* Spectrogram                                                                 */
/* -------------------------------------------------------------------------- */

const SPECTROGRAM_HEIGHT = 132

function SpectrogramView({
  label,
  data,
  topDb,
  ramp,
}: {
  label: string
  data: Spectrogram
  topDb: number
  ramp: Uint8ClampedArray
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    canvas.width = data.columns
    canvas.height = data.bins
    const image = context.createImageData(data.columns, data.bins)
    const bottom = topDb - DISPLAY_RANGE_DB
    for (let c = 0; c < data.columns; c++) {
      for (let b = 0; b < data.bins; b++) {
        const t = (data.db[c * data.bins + b] - bottom) / DISPLAY_RANGE_DB
        const level = Math.round(255 * Math.min(1, Math.max(0, t)))
        // Row 0 is the top of the canvas, where the highest bin belongs.
        const offset = ((data.bins - 1 - b) * data.columns + c) * 4
        image.data[offset] = ramp[level * 3]
        image.data[offset + 1] = ramp[level * 3 + 1]
        image.data[offset + 2] = ramp[level * 3 + 2]
        image.data[offset + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
  }, [data, ramp, topDb])

  const readout = useMemo(() => {
    if (!hover) return null
    const column = Math.min(data.columns - 1, Math.floor(hover.x * data.columns))
    const bin = Math.min(data.bins - 1, Math.floor((1 - hover.y) * data.bins))
    return {
      time: (column / Math.max(1, data.columns - 1)) * data.duration,
      frequency: binFrequency(bin, data),
      level: data.db[column * data.bins + bin] - topDb,
    }
  }, [data, hover, topDb])

  const nyquist = data.sampleRate / 2

  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <figcaption className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular text-muted-foreground">
          {readout
            ? `${readout.time.toFixed(2)} s · ${formatHz(readout.frequency)} · ${formatDb(readout.level)}`
            : 'Hover to read a point'}
        </span>
      </figcaption>
      <div className="flex gap-2">
        <div
          className="tabular flex flex-col justify-between text-right text-[10px] leading-none text-muted-foreground"
          style={{ height: SPECTROGRAM_HEIGHT }}
          aria-hidden
        >
          <span>{formatHz(nyquist)}</span>
          <span>{formatHz(nyquist / 2)}</span>
          <span>0</span>
        </div>
        <div
          className="relative min-w-0 flex-1 cursor-crosshair overflow-hidden rounded-sm border border-border"
          style={{ height: SPECTROGRAM_HEIGHT }}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            setHover({
              x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
              y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
            })
          }}
          onPointerLeave={() => setHover(null)}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${label} spectrogram, 0 to ${formatHz(nyquist)} over ${data.duration.toFixed(1)} seconds`}
            className="block size-full"
          />
          {hover ? (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 w-px bg-foreground/50"
                style={{ left: `${hover.x * 100}%` }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 h-px bg-foreground/50"
                style={{ top: `${hover.y * 100}%` }}
              />
            </>
          ) : null}
        </div>
      </div>
      <div className="tabular flex justify-between pl-12 text-[10px] text-muted-foreground" aria-hidden>
        <span>0 s</span>
        <span>{data.duration.toFixed(1)} s</span>
      </div>
    </figure>
  )
}

function ColourScale({ low, high }: { low: Rgb; high: Rgb }) {
  const rgb = (c: Rgb) => `rgb(${c.join(' ')})`
  return (
    <div className="flex items-center gap-2 pl-12 text-[10px] text-muted-foreground">
      <span className="tabular">−{DISPLAY_RANGE_DB} dB</span>
      <div
        className="h-2 flex-1 rounded-full border border-border"
        style={{ background: `linear-gradient(to right, ${rgb(low)}, ${rgb(high)})` }}
        aria-hidden
      />
      <span className="tabular">0 dB (loudest bin)</span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Average spectrum                                                            */
/* -------------------------------------------------------------------------- */

const CHART_WIDTH = 480
const CHART_HEIGHT = 180
const MARGIN = { top: 12, right: 12, bottom: 22, left: 36 }
const LOW_HZ = 50

function AverageSpectrum({
  input,
  output,
  outputLabel,
  topDb,
}: {
  input: Spectrogram
  output: Spectrogram
  outputLabel: string
  topDb: number
}) {
  const [hoverBin, setHoverBin] = useState<number | null>(null)
  const nyquist = Math.min(input.sampleRate, output.sampleRate) / 2
  const plotWidth = CHART_WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom
  const bottomDb = -DISPLAY_RANGE_DB

  const x = (hz: number) =>
    MARGIN.left + (Math.log(hz / LOW_HZ) / Math.log(nyquist / LOW_HZ)) * plotWidth
  const y = (db: number) =>
    MARGIN.top + (1 - (Math.min(0, Math.max(bottomDb, db)) - bottomDb) / -bottomDb) * plotHeight

  const pathFor = (data: Spectrogram) => {
    const points: string[] = []
    for (let b = 1; b < data.bins; b++) {
      const hz = binFrequency(b, data)
      if (hz < LOW_HZ || hz > nyquist) continue
      points.push(`${x(hz).toFixed(1)},${y(data.average[b] - topDb).toFixed(1)}`)
    }
    return points.length ? `M${points.join('L')}` : ''
  }

  const ticksHz = [100, 300, 1000, 3000, 10000].filter((hz) => hz > LOW_HZ && hz < nyquist)
  const ticksDb = [0, -30, -60, -90]

  const hover = useMemo(() => {
    if (hoverBin === null) return null
    const hz = binFrequency(hoverBin, input)
    const a = input.average[hoverBin] - topDb
    const b = (output.average[hoverBin] ?? -Infinity) - topDb
    return { hz, a, b }
  }, [hoverBin, input, output, topDb])

  const inputPath = pathFor(input)
  const outputPath = pathFor(output)
  const lastOutput = output.average[Math.floor((output.bins * 2) / 3)] - topDb
  const lastInput = input.average[Math.floor((input.bins * 2) / 3)] - topDb

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">Average spectrum</span>
        <span className="flex items-center gap-3 text-muted-foreground">
          <LegendSwatch color="var(--series-1)" label="Input" />
          <LegendSwatch color="var(--series-2)" label={outputLabel} />
        </span>
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="block w-full touch-none select-none"
          role="img"
          aria-label={`Average spectrum of the input and ${outputLabel.toLowerCase()} audio, log frequency axis`}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            const px = ((event.clientX - box.left) / box.width) * CHART_WIDTH
            const t = (px - MARGIN.left) / plotWidth
            if (t < 0 || t > 1) return setHoverBin(null)
            const hz = LOW_HZ * (nyquist / LOW_HZ) ** t
            setHoverBin(Math.min(input.bins - 1, Math.round((hz * FRAME_LENGTH) / input.sampleRate)))
          }}
          onPointerLeave={() => setHoverBin(null)}
        >
          {ticksDb.map((db) => (
            <g key={db}>
              <line
                x1={MARGIN.left}
                x2={CHART_WIDTH - MARGIN.right}
                y1={y(db)}
                y2={y(db)}
                stroke="var(--graticule)"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 6}
                y={y(db)}
                dy="0.32em"
                textAnchor="end"
                className="tabular fill-muted-foreground text-[10px]"
              >
                {db}
              </text>
            </g>
          ))}
          {ticksHz.map((hz) => (
            <text
              key={hz}
              x={x(hz)}
              y={CHART_HEIGHT - 6}
              textAnchor="middle"
              className="tabular fill-muted-foreground text-[10px]"
            >
              {formatHz(hz)}
            </text>
          ))}
          <rect
            x={x(300)}
            y={MARGIN.top}
            width={Math.max(0, x(Math.min(3400, nyquist)) - x(300))}
            height={plotHeight}
            fill="var(--foreground)"
            opacity={0.04}
          />
          <text x={x(1000)} y={MARGIN.top + 10} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            speech band
          </text>
          <path d={inputPath} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
          <path d={outputPath} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeLinejoin="round" />
          <text
            x={CHART_WIDTH - MARGIN.right}
            y={y(Math.max(lastInput, lastOutput)) - 6}
            textAnchor="end"
            className="fill-muted-foreground text-[10px]"
          >
            Input
          </text>
          <text
            x={CHART_WIDTH - MARGIN.right}
            y={y(Math.min(lastInput, lastOutput)) + 12}
            textAnchor="end"
            className="fill-muted-foreground text-[10px]"
          >
            {outputLabel}
          </text>
          {hover ? (
            <g pointerEvents="none">
              <line
                x1={x(hover.hz)}
                x2={x(hover.hz)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
                stroke="var(--foreground)"
                strokeOpacity={0.4}
              />
              <circle cx={x(hover.hz)} cy={y(hover.a)} r={4} fill="var(--series-1)" stroke="var(--card)" strokeWidth={2} />
              <circle cx={x(hover.hz)} cy={y(hover.b)} r={4} fill="var(--series-2)" stroke="var(--card)" strokeWidth={2} />
            </g>
          ) : null}
        </svg>
        {hover ? (
          <div
            className="tabular pointer-events-none absolute top-1 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm"
            style={
              x(hover.hz) > CHART_WIDTH / 2
                ? { right: `${(1 - x(hover.hz) / CHART_WIDTH) * 100 + 2}%` }
                : { left: `${(x(hover.hz) / CHART_WIDTH) * 100 + 2}%` }
            }
          >
            <p className="font-medium">{formatHz(hover.hz)}</p>
            <p className="flex items-center gap-1.5">
              <Dot color="var(--series-1)" /> Input {formatDb(hover.a)}
            </p>
            <p className="flex items-center gap-1.5">
              <Dot color="var(--series-2)" /> {outputLabel} {formatDb(hover.b)}
            </p>
            <p className="text-muted-foreground">Change {formatChange(hover.b - hover.a)}</p>
          </div>
        ) : null}
      </div>
    </figure>
  )
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block size-2 rounded-full" style={{ background: color }} aria-hidden />
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Summary and table                                                           */
/* -------------------------------------------------------------------------- */

function Stat({ label, before, after }: { label: string; before: number; after: number }) {
  const change = after - before
  return (
    <div className="min-w-0 rounded-md border border-border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular text-lg leading-tight font-medium">{formatChange(change)}</p>
      <p className="tabular text-[11px] text-muted-foreground">
        {formatDb(before)} → {formatDb(after)}
      </p>
    </div>
  )
}

function BandTable({
  input,
  output,
  outputLabel,
}: {
  input: Spectrogram
  output: Spectrogram
  outputLabel: string
}) {
  const bands = octaveBands(Math.min(input.sampleRate, output.sampleRate))
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="focus-ring w-fit cursor-pointer rounded-sm select-none hover:text-foreground">
        Octave bands as a table
      </summary>
      <table className="tabular mt-2 w-full text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="py-1 font-medium">Band</th>
            <th className="py-1 text-right font-medium">Input</th>
            <th className="py-1 text-right font-medium">{outputLabel}</th>
            <th className="py-1 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody className="text-foreground">
          {bands.map((band) => {
            const a = bandLevel(input, band.low, band.high)
            const b = bandLevel(output, band.low, band.high)
            return (
              <tr key={band.centre} className="border-b border-border/60">
                <td className="py-1">{formatHz(band.centre)}</td>
                <td className="py-1 text-right">{formatDb(a)}</td>
                <td className="py-1 text-right">{formatDb(b)}</td>
                <td className="py-1 text-right">{formatChange(b - a)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </details>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Before/after view of an audio operation: summary deltas, a spectrogram of
 * each file on one shared colour scale, and their average spectra overlaid.
 * Levels are dB relative to full scale; the charts show them relative to the
 * loudest bin of either file so the two stay comparable.
 */
function SpectrumCompareImpl({ input, output, outputLabel }: SpectrumCompareProps) {
  const analysis = useAnalysis(input, output)
  const { ramp, low, high } = useRamp()

  if (analysis.phase === 'loading') {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Analysing spectra…
      </p>
    )
  }
  if (analysis.phase === 'error') {
    return <p className="text-xs text-muted-foreground">Spectrum view unavailable: {analysis.message}</p>
  }

  const { input: a, output: b } = analysis
  const topDb = Math.max(a.peakDb, b.peakDb)

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-4" aria-label="Spectrum comparison">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Background (quietest 10 %)" before={a.floorDb} after={b.floorDb} />
        <Stat
          label="Speech band, 300–3400 Hz"
          before={bandLevel(a, 300, 3400)}
          after={bandLevel(b, 300, 3400)}
        />
      </div>
      <div className="flex flex-col gap-3">
        <SpectrogramView label="Input" data={a} topDb={topDb} ramp={ramp} />
        <SpectrogramView label={outputLabel} data={b} topDb={topDb} ramp={ramp} />
        <ColourScale low={low} high={high} />
      </div>
      <AverageSpectrum input={a} output={b} outputLabel={outputLabel} topDb={topDb} />
      <BandTable input={a} output={b} outputLabel={outputLabel} />
    </section>
  )
}

export const SpectrumCompare = memo(SpectrumCompareImpl)
