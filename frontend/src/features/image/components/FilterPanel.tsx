import { SlidersHorizontal } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { MaskPreview } from '@/features/image/components/MaskPreview'
import type { MaskParams } from '@/lib/mask'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { cn } from '@/lib/utils'
import { IMAGE_DEFAULTS, applyFilter } from '@/services/imageService'
import type {
  FilterKind,
  FilterShape,
  TransformBackend,
} from '@/services/types'

const ICON = <SlidersHorizontal className="size-4" aria-hidden />

const KINDS: ReadonlyArray<{
  value: FilterKind
  label: string
  hint: string
}> = [
  { value: 'low', label: 'Low-pass', hint: 'Keeps structure, drops detail' },
  { value: 'high', label: 'High-pass', hint: 'Keeps edges, drops flat areas' },
  { value: 'band', label: 'Band-pass', hint: 'Keeps one ring of frequencies' },
]

const SHAPES: ReadonlyArray<{ value: FilterShape; label: string }> = [
  { value: 'gaussian', label: 'Gaussian' },
  { value: 'butterworth', label: 'Butterworth' },
  { value: 'ideal', label: 'Ideal' },
]

const SHAPE_NOTES: Record<FilterShape, string> = {
  gaussian: 'Smooth roll-off. No ringing, but the cutoff is soft.',
  butterworth: 'Roll-off steepness set by the order. A middle ground.',
  ideal: 'A hard wall in the spectrum. Sharpest cut, and it rings visibly.',
}

export function FilterPanel({ backend }: { backend: TransformBackend }) {
  const [input, setInput] = useState<File | null>(null)
  const [kind, setKind] = useState<FilterKind>('low')
  const [cutoff, setCutoff] = useState<number>(IMAGE_DEFAULTS.filterCutoff)
  const [highCutoff, setHighCutoff] = useState<number>(
    IMAGE_DEFAULTS.filterHighCutoff,
  )
  const [filterShape, setFilterShape] = useState<FilterShape>('gaussian')
  const [order, setOrder] = useState<number>(IMAGE_DEFAULTS.filterOrder)
  const { state, execute, reset } = useOperation(applyFilter)

  const isRunning = state.phase === 'running'

  // Both derived during render. The backend rejects a band whose upper edge is
  // not above the lower one, so the button is blocked before the round trip.
  const isBand = kind === 'band'
  const bandValid = !isBand || highCutoff > cutoff
  const canRun = input !== null && bandValid

  const handleRun = useCallback(() => {
    if (!input || !bandValid) return
    void execute({
      input,
      kind,
      cutoff,
      highCutoff: isBand ? highCutoff : null,
      filterShape,
      order,
      backend,
    })
  }, [
    backend,
    bandValid,
    cutoff,
    execute,
    filterShape,
    highCutoff,
    input,
    isBand,
    kind,
    order,
  ])

  const maskParams = useMemo<MaskParams>(
    () => ({
      kind,
      cutoff,
      highCutoff: isBand ? highCutoff : null,
      shape: filterShape,
      order,
    }),
    [cutoff, filterShape, highCutoff, isBand, kind, order],
  )

  const command = [
    'phaseforge --backend',
    backend,
    'filter',
    input?.name ?? '<input>',
    'filtered.png --kind',
    kind,
    '--cutoff',
    cutoff,
    isBand ? `--high-cutoff ${highCutoff}` : '',
    '--filter-shape',
    filterShape,
    filterShape === 'butterworth' ? `--order ${order}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <OperationShell
      tone="image"
      icon={ICON}
      title="Frequency-domain filtering"
      description="Builds a radial gain mask over the shifted spectrum, applies it, and transforms back. Cutoffs are fractions of the Nyquist limit, so they do not depend on image size."
      command="filter"
      runLabel="Apply filter"
      canRun={canRun}
      blockedReason={
        input === null
          ? 'Pick an image'
          : 'Band-pass needs an upper cutoff above the lower one'
      }
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      result={
        <>
          <MaskPreview params={maskParams} />
          {state.phase === 'idle' ? null : (
            <ResultPanel
              state={state}
              tone="image"
              idleHint=""
              cliCommand={command}
            />
          )}
        </>
      }
    >
      <FileDropzone
        label="Source image"
        kind="image"
        accept={ACCEPT_IMAGE}
        tone="image"
        file={input}
        onFileChange={setInput}
        disabled={isRunning}
      />

      <div className="flex flex-col gap-2">
        <Label>Filter kind</Label>
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map((option) => {
            const isActive = option.value === kind
            return (
              <button
                key={option.value}
                type="button"
                disabled={isRunning}
                aria-pressed={isActive}
                onClick={() => setKind(option.value)}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60',
                  isActive
                    ? 'border-image bg-image-wash text-image'
                    : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <span className="block text-sm font-medium">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs opacity-80">
                  {option.hint}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <ParamSlider
        label={isBand ? 'Lower cutoff' : 'Cutoff'}
        description="0 is DC, 1 is the edge of the spectrum."
        value={cutoff}
        min={0.02}
        max={1.4}
        step={0.01}
        disabled={isRunning}
        onChange={setCutoff}
      />

      {isBand ? (
        <ParamSlider
          label="Upper cutoff"
          description="Must sit above the lower cutoff."
          value={highCutoff}
          min={0.02}
          max={1.4}
          step={0.01}
          disabled={isRunning}
          onChange={setHighCutoff}
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="filter-shape">Mask shape</Label>
        <Select
          value={filterShape}
          disabled={isRunning}
          onValueChange={(next) => setFilterShape(next as FilterShape)}
        >
          <SelectTrigger id="filter-shape">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SHAPES.map((shape) => (
              <SelectItem key={shape.value} value={shape.value}>
                {shape.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {SHAPE_NOTES[filterShape]}
        </p>
      </div>

      {filterShape === 'butterworth' ? (
        <ParamSlider
          label="Order"
          description="Higher is a steeper roll-off, approaching the ideal mask."
          value={order}
          min={1}
          max={10}
          step={1}
          disabled={isRunning}
          onChange={setOrder}
        />
      ) : null}
    </OperationShell>
  )
}
