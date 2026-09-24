import { memo, useEffect, useId, useState } from 'react'

import { cn } from '@/lib/utils'

/** One sine period, in SVG units. The waves slide by exactly this much per loop. */
const PERIOD = 40
const WIDTH = 120
const HEIGHT = 40

/** One extra period on each side, so the slide never shows an edge. */
function sinePoints(phase: number) {
  const points: string[] = []
  for (let x = -PERIOD; x <= WIDTH + PERIOD; x += 2) {
    const y = HEIGHT / 2 + 12 * Math.sin((2 * Math.PI * x) / PERIOD + phase)
    points.push(`${x},${y.toFixed(2)}`)
  }
  return points.join(' ')
}

// Computed once: the shapes never change, only their CSS transform does.
const WAVE = sinePoints(0)
const SHIFTED = sinePoints(Math.PI)

const DEFAULT_MESSAGES = [
  'Sending your files',
  'Running the Fourier transform',
  'Shifting phases',
  'Crunching the spectrum',
  'Almost there',
]

interface PhaseLoaderProps {
  /** Status lines shown in turn while waiting. */
  messages?: readonly string[]
  className?: string
}

/**
 * Two phase-opposed waves drifting past each other. They cross at the same
 * points on every frame, which is what a phase shift of pi looks like.
 * Motion stops under `prefers-reduced-motion` (see `index.css`).
 */
function PhaseLoaderImpl({ messages = DEFAULT_MESSAGES, className }: PhaseLoaderProps) {
  const [index, setIndex] = useState(0)
  // Unique per instance: two loaders on screen must not share a mask.
  const id = useId()
  const fadeId = `${id}-fade`
  const maskId = `${id}-mask`

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((previous) => Math.min(previous + 1, messages.length - 1))
    }, 1400)
    return () => clearInterval(timer)
  }, [messages])

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-4', className)}
    >
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-12 w-36 overflow-hidden" aria-hidden>
        <defs>
          <linearGradient id={fadeId} x1="0" x2="1">
            <stop offset="0" stopColor="white" stopOpacity="0" />
            <stop offset="0.2" stopColor="white" stopOpacity="1" />
            <stop offset="0.8" stopColor="white" stopOpacity="1" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id={maskId}>
            <rect width={WIDTH} height={HEIGHT} fill={`url(#${fadeId})`} />
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>
          <polyline
            points={SHIFTED}
            fill="none"
            stroke="var(--primary)"
            strokeOpacity="0.35"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="phase-wave-right"
          />
          <polyline
            points={WAVE}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="phase-wave-left"
          />
        </g>
      </svg>
      <p key={index} className="phase-loader-text text-sm text-muted-foreground">
        {messages[index]}…
      </p>
    </div>
  )
}

export const PhaseLoader = memo(PhaseLoaderImpl)
