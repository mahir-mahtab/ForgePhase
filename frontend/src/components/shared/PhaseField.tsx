import { memo, useMemo } from 'react'

/**
 * A random phase field -- the thing DRPE actually multiplies by.
 *
 * Both masks in double random phase encryption are fields of uniformly random
 * phase, and this draws one: the image path as a plane, the audio path as the
 * fixed-size blocks the waveform is cut into. It is generated, not decorative,
 * and it is the most characteristic object in this toolkit.
 */

/** Deterministic PRNG, so the field is stable across renders and reloads. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Phase is uniform on [0, 2pi); opacity stands in for the angle. The floor
 * keeps the darkest cells legible on a light plate, where a raw 0 would
 * disappear into the background entirely.
 */
function encode(phase: number) {
  return Number((0.18 + phase * 0.82).toFixed(2))
}

type FieldLayout = 'plane' | 'blocks'

interface PhaseFieldProps {
  layout: FieldLayout
  tone: 'image' | 'audio'
  className?: string
}

const PLANE_CELLS = 22
const BLOCK_COUNT = 8
/** Cells per block. Wide enough to read as a block rather than a stripe. */
const BLOCK_COLUMNS = 3
const BLOCK_ROWS = 8
/** Gap between blocks, in cell units: DRPE runs per block, and it shows. */
const BLOCK_GAP = 0.7

interface Cell {
  x: number
  y: number
  w: number
  h: number
  o: number
}

function buildPlane(): { cells: Cell[]; width: number; height: number } {
  const random = mulberry32(0x5eed)
  const cells: Cell[] = []

  for (let row = 0; row < PLANE_CELLS; row += 1) {
    for (let column = 0; column < PLANE_CELLS; column += 1) {
      cells.push({
        x: column,
        y: row,
        w: 1,
        h: 1,
        o: encode(random()),
      })
    }
  }

  return { cells, width: PLANE_CELLS, height: PLANE_CELLS }
}

function buildBlocks(): { cells: Cell[]; width: number; height: number } {
  const random = mulberry32(0xb10c)
  const cells: Cell[] = []
  const stride = BLOCK_COLUMNS + BLOCK_GAP

  for (let block = 0; block < BLOCK_COUNT; block += 1) {
    for (let row = 0; row < BLOCK_ROWS; row += 1) {
      for (let column = 0; column < BLOCK_COLUMNS; column += 1) {
        cells.push({
          x: Number((block * stride + column).toFixed(2)),
          y: row,
          w: 1,
          h: 1,
          o: encode(random()),
        })
      }
    }
  }

  return {
    cells,
    width: Number((BLOCK_COUNT * stride - BLOCK_GAP).toFixed(2)),
    height: BLOCK_ROWS,
  }
}

// Built once at module load: both fields are constant for the app's lifetime.
const FIELDS: Record<FieldLayout, ReturnType<typeof buildPlane>> = {
  plane: buildPlane(),
  blocks: buildBlocks(),
}

function PhaseFieldImpl({ layout, tone, className }: PhaseFieldProps) {
  const field = FIELDS[layout]
  const color = tone === 'image' ? 'var(--ch-image)' : 'var(--ch-audio)'

  const cells = useMemo(
    () =>
      field.cells.map((cell) => (
        <rect
          key={`${cell.x}-${cell.y}`}
          x={cell.x}
          y={cell.y}
          width={cell.w}
          height={cell.h}
          fill={color}
          fillOpacity={cell.o}
        />
      )),
    [field, color],
  )

  return (
    <svg
      viewBox={`0 0 ${field.width} ${field.height}`}
      className={className}
      preserveAspectRatio="none"
      role="img"
      aria-label={
        layout === 'plane'
          ? 'A plane of uniformly random phase'
          : 'Fixed-size blocks, each with its own random phase'
      }
    >
      <rect width={field.width} height={field.height} fill="var(--plate)" />
      {cells}
    </svg>
  )
}

export const PhaseField = memo(PhaseFieldImpl)
