import { useCallback, useMemo, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MaskPreview } from '@/features/image/components/MaskPreview'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import type { MaskParams } from '@/lib/mask'
import { SAMPLES } from '@/lib/samples'
import { IMAGE_DEFAULTS, applyFilter } from '@/services/imageService'
import type { FilterKind, FilterShape, TransformBackend } from '@/services/types'

const KINDS: ReadonlyArray<{ value: FilterKind; label: string }> = [
  { value: 'low', label: 'Low-pass' },
  { value: 'high', label: 'High-pass' },
  { value: 'band', label: 'Band-pass' },
]

const KIND_NOTES: Record<FilterKind, string> = {
  low: 'Keeps broad shapes and removes fine detail, like a blur.',
  high: 'Keeps edges and texture and removes smooth areas.',
  band: 'Keeps one ring of frequencies between the two cutoffs.',
}

const SHAPES: ReadonlyArray<{ value: FilterShape; label: string; note: string }> = [
  { value: 'gaussian', label: 'Gaussian', note: 'Smooth roll-off, no ringing.' },
  { value: 'butterworth', label: 'Butterworth', note: 'Steepness set by the order.' },
  { value: 'ideal', label: 'Ideal', note: 'Hard cut; causes visible ringing.' },
]

export function FilterPanel({ backend }: { backend: TransformBackend }) {
  const [input, setInput] = useState<File | null>(null)
  const [kind, setKind] = useState<FilterKind>('low')
  const [cutoff, setCutoff] = useState<number>(IMAGE_DEFAULTS.filterCutoff)
  const [highCutoff, setHighCutoff] = useState<number>(IMAGE_DEFAULTS.filterHighCutoff)
  const [filterShape, setFilterShape] = useState<FilterShape>('gaussian')
  const [order, setOrder] = useState<number>(IMAGE_DEFAULTS.filterOrder)
  const { state, execute, reset } = useOperation(applyFilter)

  const isRunning = state.phase === 'running'
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
  }, [backend, bandValid, cutoff, execute, filterShape, highCutoff, input, isBand, kind, order])

  const maskParams = useMemo<MaskParams>(
    () => ({ kind, cutoff, highCutoff: isBand ? highCutoff : null, shape: filterShape, order }),
    [cutoff, filterShape, highCutoff, isBand, kind, order],
  )

  return (
    <OperationShell
      title="Frequency filter"
      description="Applies a radial gain mask to the image's spectrum and transforms back. Cutoffs are fractions of the highest frequency, so they work at any image size."
      runLabel="Apply filter"
      canRun={canRun}
      blockedReason={input === null ? 'Choose an image.' : 'The upper cutoff must be above the lower one.'}
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', '--backend', backend, 'filter', input?.name ?? 'input.png', 'filtered.png',
        '--kind', kind, '--cutoff', cutoff, isBand && '--high-cutoff', isBand && highCutoff,
        '--filter-shape', filterShape, filterShape === 'butterworth' && '--order',
        filterShape === 'butterworth' && order,
      )}
      result={
        <>
          <ResultPanel
            state={state}
            idleHint="The filtered image appears here. Adjust the settings and watch the mask preview below."
          />
          <MaskPreview params={maskParams} />
        </>
      }
    >
      <FileDropzone
        label="Image"
        kind="image"
        accept={ACCEPT_IMAGE}
        file={input}
        onFileChange={setInput}
        disabled={isRunning}
        sample={SAMPLES.image}
      />

      <div className="flex flex-col gap-1.5">
        <Label>Filter type</Label>
        <SegmentedControl
          label="Filter type"
          value={kind}
          options={KINDS}
          onChange={setKind}
          disabled={isRunning}
        />
        <p className="text-xs text-muted-foreground">{KIND_NOTES[kind]}</p>
      </div>

      <ParamSlider
        label={isBand ? 'Lower cutoff' : 'Cutoff'}
        description="0 is the centre of the spectrum (DC), 1 its edge."
        value={cutoff}
        min={0.02}
        max={1.4}
        step={0.01}
        disabled={isRunning}
        onChange={setCutoff}
      />

      {isBand ? (
        <div className="flex flex-col gap-1.5">
          <ParamSlider
            label="Upper cutoff"
            value={highCutoff}
            min={0.02}
            max={1.4}
            step={0.01}
            disabled={isRunning}
            onChange={setHighCutoff}
          />
          {!bandValid ? (
            <p className="text-xs text-destructive">Must be above the lower cutoff.</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
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
          {SHAPES.find((shape) => shape.value === filterShape)?.note}
        </p>
      </div>

      {filterShape === 'butterworth' ? (
        <ParamSlider
          label="Order"
          description="Higher is steeper, approaching the ideal mask."
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
