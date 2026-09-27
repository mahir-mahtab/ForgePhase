import { memo, useId, useMemo } from 'react'

import {
  MAX_RADIUS,
  type MaskParams,
  maskGain,
  sampleProfile,
} from '@/lib/mask'

/**
 * Contour rings across the plate.
 *
 * Deliberately few and deliberately separated: the plate is a contour plot of
 * the gain field, not a smooth wash of it. The continuous function is plotted
 * exactly, once, in the trace underneath.
 */
const RINGS = 26
/** Ring thickness as a fraction of its band, leaving the contour gap. */
const RING_FILL = 0.82
/** Samples along the profile trace. */
const PROFILE_STEPS = 96

const PLATE = 200
const CENTER = PLATE / 2
const PROFILE_HEIGHT = 46
const GAP = 14
const TOTAL_HEIGHT = PLATE + GAP + PROFILE_HEIGHT

interface FrequencyPlaneProps {
  params: MaskParams
  /** Turns off the ring field, leaving the bare plate and its graticule. */
  quiet?: boolean
}

/**
 * The mask, drawn as it actually is: a radial gain field over the shifted
 * spectrum, with DC at the centre. Below it, the same function as a profile
 * from centre to corner.
 *
 * Rings are stroked rather than filled so each band owns its own annulus --
 * stacking translucent filled circles would composite each gain on top of the
 * ones outside it and read wrong.
 */
const COLOR = 'var(--primary)'

function FrequencyPlaneImpl({ params, quiet = false }: FrequencyPlaneProps) {
  const color = COLOR

  // Unique per instance: duplicate ids would make every plot clip to the first.
  const clipId = useId()

  const rings = useMemo(() => {
    if (quiet) return []
    const band = (CENTER * MAX_RADIUS) / RINGS

    return Array.from({ length: RINGS }, (_, index) => {
      const normalized = ((index + 0.5) / RINGS) * MAX_RADIUS
      return {
        r: Number((normalized * CENTER).toFixed(1)),
        width: Number((band * RING_FILL).toFixed(1)),
        gain: Number(maskGain(normalized, params).toFixed(3)),
      }
    })
  }, [params, quiet])

  const profile = useMemo(
    () => (quiet ? null : sampleProfile(params, PROFILE_STEPS)),
    [params, quiet],
  )

  const trace = useMemo(() => {
    if (!profile) return ''
    const points: string[] = []
    for (let i = 0; i < profile.length; i += 1) {
      const x = (i / (profile.length - 1)) * PLATE
      const y = PROFILE_HEIGHT - (profile[i] ?? 0) * PROFILE_HEIGHT
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    }
    return points.join(' ')
  }, [profile])

  return (
    <svg
      viewBox={`0 0 ${PLATE} ${TOTAL_HEIGHT}`}
      className="block w-full"
      role="img"
      aria-label={`${params.kind}-pass ${params.shape} mask, cutoff ${params.cutoff}`}
    >
      <defs>
        <clipPath id={clipId}>
          <rect width={PLATE} height={PLATE} />
        </clipPath>
      </defs>

      <rect width={PLATE} height={PLATE} fill="var(--plate)" />

      <g clipPath={`url(#${clipId})`}>
        {rings.map((ring) => (
          <circle
            key={ring.r}
            cx={CENTER}
            cy={CENTER}
            r={ring.r}
            fill="none"
            stroke={color}
            strokeWidth={ring.width}
            strokeOpacity={ring.gain}
          />
        ))}

        {/* Graticule: unit radius, and the axes through DC. */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={CENTER}
          fill="none"
          stroke="var(--graticule)"
          strokeWidth="1"
        />
        <path
          d={`M0 ${CENTER}H${PLATE}M${CENTER} 0V${PLATE}`}
          stroke="var(--graticule)"
          strokeWidth="1"
        />
      </g>

      <rect
        width={PLATE}
        height={PLATE}
        fill="none"
        stroke="var(--plate-edge)"
        strokeWidth="1"
      />

      {/* DC marker. Everything in this plate is measured from here. */}
      <circle cx={CENTER} cy={CENTER} r="2" fill="var(--plate-mark)" />

      <g transform={`translate(0 ${PLATE + GAP})`}>
        <rect width={PLATE} height={PROFILE_HEIGHT} fill="var(--plate)" />
        {profile ? (
          <>
            <polyline
              points={`0,${PROFILE_HEIGHT} ${trace} ${PLATE},${PROFILE_HEIGHT}`}
              fill={color}
              fillOpacity="0.16"
              stroke="none"
            />
            <polyline
              points={trace}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </>
        ) : null}
        <rect
          width={PLATE}
          height={PROFILE_HEIGHT}
          fill="none"
          stroke="var(--plate-edge)"
          strokeWidth="1"
        />
      </g>
    </svg>
  )
}

export const FrequencyPlane = memo(FrequencyPlaneImpl)
