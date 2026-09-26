import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { SwitchField } from '@/components/shared/SwitchField'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOperation } from '@/hooks/useOperation'
import { usePixelLimit } from '@/hooks/usePixelLimit'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import { PIXEL_LIMITS } from '@/lib/limits'
import { SAMPLES } from '@/lib/samples'
import { IMAGE_DEFAULTS, createHybrid } from '@/services/imageService'
import type { FilterShape, HybridView } from '@/services/types'

const VIEWS: ReadonlyArray<{ value: HybridView; label: string }> = [
  { value: 'distance', label: 'Sizes' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'high', label: 'Near' },
  { value: 'low', label: 'Far' },
]

const VIEW_NOTES: Record<HybridView, string> = {
  distance: 'The hybrid at full, half, quarter and eighth size, side by side. Shrinking it is what stepping back does.',
  hybrid: 'The blended image at full size. Look at it close up, then from across the room.',
  high: 'Only the near image\'s fine detail, the band that wins up close. Lifted to mid-grey so it is visible.',
  low: 'Only the far image\'s broad shapes, the band that wins from a distance. Fitted to the near image\'s size.',
}

const SHAPES: ReadonlyArray<{ value: FilterShape; label: string }> = [
  { value: 'gaussian', label: 'Gaussian' },
  { value: 'butterworth', label: 'Butterworth' },
  { value: 'ideal', label: 'Ideal' },
]

export function HybridPanel() {
  const [near, setNear] = useState<File | null>(null)
  const [far, setFar] = useState<File | null>(null)
  const [nearCutoff, setNearCutoff] = useState<number>(IMAGE_DEFAULTS.hybridNearCutoff)
  const [farCutoff, setFarCutoff] = useState<number>(IMAGE_DEFAULTS.hybridFarCutoff)
  const [nearGain, setNearGain] = useState<number>(IMAGE_DEFAULTS.hybridNearGain)
  const [filterShape, setFilterShape] = useState<FilterShape>('gaussian')
  const [greyscale, setGreyscale] = useState(false)
  const [view, setView] = useState<HybridView>('distance')
  const { state, execute, reset } = useOperation(createHybrid)

  const isRunning = state.phase === 'running'
  const nearError = usePixelLimit(near, PIXEL_LIMITS.edit)
  const farError = usePixelLimit(far, PIXEL_LIMITS.edit)
  const canRun = near !== null && far !== null && nearError === null && farError === null

  const handleRun = useCallback(() => {
    if (!near || !far) return
    void execute({ near, far, nearCutoff, farCutoff, nearGain, filterShape, greyscale, view })
  }, [execute, far, farCutoff, filterShape, greyscale, near, nearCutoff, nearGain, view])

  return (
    <OperationShell
      title="Hybrid image"
      description="Keeps only the fine detail of the near image and only the broad shapes of the far one, then adds them. Up close the detail wins; from a distance the eye cannot resolve it and the far image takes over. Line the two up first: eyes over eyes, outline over outline."
      runLabel="Blend"
      canRun={canRun}
      blockedReason={
        near === null || far === null ? 'Choose a near and a far image.' : 'Choose smaller images.'
      }
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'hybrid',
        near?.name ?? 'near.png', far?.name ?? 'far.png', 'hybrid.png',
        '--near-cutoff', nearCutoff, '--far-cutoff', farCutoff,
        nearGain !== 1 && '--near-gain', nearGain !== 1 && nearGain,
        filterShape !== 'gaussian' && '--filter-shape', filterShape !== 'gaussian' && filterShape,
        greyscale && '--greyscale',
        view === 'distance' && '--distance', view === 'distance' && 'distance.png',
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The blended image appears here. Sizes shows it at several sizes, so you can see both faces without leaving your seat."
        />
      }
    >
      <FileDropzone
        label="Near image"
        hint="seen up close"
        kind="image"
        accept={ACCEPT_IMAGE}
        file={near}
        onFileChange={setNear}
        disabled={isRunning}
        sample={SAMPLES.hybridNear}
        error={nearError}
      />
      <FileDropzone
        label="Far image"
        hint="seen from a distance"
        kind="image"
        accept={ACCEPT_IMAGE}
        file={far}
        onFileChange={setFar}
        disabled={isRunning}
        sample={SAMPLES.hybridFar}
        error={farError}
      />

      <div className="flex flex-col gap-1.5">
        <Label>Show</Label>
        <SegmentedControl
          label="Show"
          value={view}
          options={VIEWS}
          onChange={setView}
          disabled={isRunning}
        />
        <p className="text-xs text-muted-foreground">{VIEW_NOTES[view]}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <ParamSlider
          label="Near cutoff"
          description="Detail above this frequency is kept from the near image. Higher keeps only the finest lines."
          value={nearCutoff}
          min={0.02}
          max={0.5}
          step={0.01}
          disabled={isRunning}
          onChange={setNearCutoff}
        />
        <ParamSlider
          label="Far cutoff"
          description="Shapes below this frequency are kept from the far image. Lower blurs it more."
          value={farCutoff}
          min={0.005}
          max={0.3}
          step={0.005}
          disabled={isRunning}
          onChange={setFarCutoff}
        />
        {farCutoff >= nearCutoff ? (
          <p className="text-xs text-destructive">
            The far cutoff is at or above the near one, so both images share a band and
            neither will read cleanly. Keep a gap between them.
          </p>
        ) : null}
      </div>

      <ParamSlider
        label="Near gain"
        description="Strengthens the near image's detail. Raise it if the far image shows through up close."
        value={nearGain}
        min={0.25}
        max={3}
        step={0.05}
        disabled={isRunning}
        onChange={setNearGain}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hybrid-shape">Mask shape</Label>
        <Select
          value={filterShape}
          disabled={isRunning}
          onValueChange={(next) => setFilterShape(next as FilterShape)}
        >
          <SelectTrigger id="hybrid-shape">
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
          Gaussian gives the cleanest blend; ideal leaves ripples around edges.
        </p>
      </div>

      <SwitchField
        label="Greyscale"
        description="Colour in the near image's detail tends to give the trick away."
        checked={greyscale}
        onCheckedChange={setGreyscale}
        disabled={isRunning}
      />
    </OperationShell>
  )
}
