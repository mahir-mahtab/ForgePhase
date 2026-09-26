import { BarChart3, SlidersHorizontal } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
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
import { IMAGE_DEFAULTS, runFilterPlayground } from '@/services/imageService'
import type {
  FilterKind,
  FilterShape,
  TransformBackend,
} from '@/services/types'

const ICON = <SlidersHorizontal className="size-4" aria-hidden />

const KINDS: ReadonlyArray<{ value: FilterKind; label: string; hint: string }> = [
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

function PreviewCard({ title, src, alt }: { title: string; src: string | null; alt: string }) {
  return (
    <figure className="m-0 overflow-hidden rounded-lg border border-border bg-plate">
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      </div>
      <div className="flex min-h-48 items-center justify-center p-3">
        {src ? (
          <img src={src} alt={alt} loading="lazy" decoding="async" className="max-h-64 w-full object-contain" />
        ) : (
          <p className="text-xs text-muted-foreground">Waiting for analysis…</p>
        )}
      </div>
    </figure>
  )
}

export function FilterPanel({ backend }: { backend: TransformBackend }) {
  const [input, setInput] = useState<File | null>(null)
  const [kind, setKind] = useState<FilterKind>('low')
  const [cutoff, setCutoff] = useState<number>(IMAGE_DEFAULTS.filterCutoff)
  const [highCutoff, setHighCutoff] = useState<number>(IMAGE_DEFAULTS.filterHighCutoff)
  const [filterShape, setFilterShape] = useState<FilterShape>('gaussian')
  const [order, setOrder] = useState<number>(IMAGE_DEFAULTS.filterOrder)
  const { state, execute, reset } = useOperation(runFilterPlayground)

  const isRunning = state.phase === 'running'
  const isBand = kind === 'band'
  const bandValid = !isBand || highCutoff > cutoff
  const canRun = input !== null && bandValid

  const handleRun = useCallback(() => {
    if (!input || !bandValid) return
    void execute({ input, kind, cutoff, highCutoff: isBand ? highCutoff : null, filterShape, order, backend })
  }, [backend, bandValid, cutoff, execute, filterShape, highCutoff, input, isBand, kind, order])

  const maskParams = useMemo<MaskParams>(() => ({
    kind,
    cutoff,
    highCutoff: isBand ? highCutoff : null,
    shape: filterShape,
    order,
  }), [cutoff, filterShape, highCutoff, isBand, kind, order])

  useEffect(() => {
    if (state.phase !== 'ok') return
    const urls = [
    state.data.filtered.artifact.url,
    state.data.inputSpectrum.data?.artifact.url,
    state.data.filteredSpectrum.data?.artifact.url,
   ]
    return () => {
      urls.forEach((url) => {
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
      })
    }
  }, [state])

  const command = [
    'phaseforge --backend', backend, 'filter', input?.name ?? '<input>', 'filtered.png --kind', kind,
    '--cutoff', cutoff, isBand ? `--high-cutoff ${highCutoff}` : '', '--filter-shape', filterShape,
    filterShape === 'butterworth' ? `--order ${order}` : '',
  ].filter(Boolean).join(' ')

  return (
    <OperationShell
      tone="image"
      icon={ICON}
      title="Frequency-domain playground"
      description="Tune a radial frequency mask and immediately compare the reconstructed image with its input and output spectra. The mask preview is computed live from the same formula used by the backend."
      command="filter"
      runLabel="Run frequency lab"
      canRun={canRun}
      blockedReason={input === null ? 'Pick an image' : 'Band-pass needs an upper cutoff above the lower one'}
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      result={
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="rounded-lg border border-border p-4">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="size-4 text-image" aria-hidden />
                <p className="text-sm font-medium">Live frequency mask</p>
              </div>
              <MaskPreview params={maskParams} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
            <PreviewCard
  title="Input spectrum"
  src={state.phase === 'ok' ? state.data.inputSpectrum.data?.artifact.url ?? null : null}
  alt="Log magnitude spectrum of the input image"
/>

<PreviewCard
  title="Filtered spectrum"
  src={state.phase === 'ok' ? state.data.filteredSpectrum.data?.artifact.url ?? null : null}
  alt="Log magnitude spectrum after filtering"
/>
            </div>
          </div>

          {state.phase === 'ok' ? (
            <div className="rounded-lg border border-border p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Spatial reconstruction</p>
                  <p className="text-xs text-muted-foreground">The inverse FFT after the selected spectral mask.</p>
                </div>
                <a href={state.data.filtered.artifact.url ?? undefined} download={state.data.filtered.artifact.name} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary">
                  Download filtered image
                </a>
              </div>
              {state.data.filtered.artifact.url ? (
                <img src={state.data.filtered.artifact.url} alt="Filtered reconstruction" loading="lazy" decoding="async" className="max-h-[28rem] w-full border border-plate-edge bg-plate object-contain" />
              ) : null}
            </div>
          ) : null}

          {state.phase === 'error' ? (
            <p className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{state.message}</p>
          ) : null}
          {state.phase === 'running' ? <p className="text-xs text-muted-foreground">Computing filtered image and both spectrum views…</p> : null}
          {state.phase === 'not-implemented' ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}
          {state.phase === 'idle' ? <p className="text-xs text-muted-foreground">Run the lab to generate the reconstruction and before/after spectra.</p> : null}
          <p className="font-mono text-[11px] text-muted-foreground">{command}</p>
        </div>
      }
    >
      <FileDropzone label="Source image" kind="image" accept={ACCEPT_IMAGE} tone="image" file={input} onFileChange={setInput} disabled={isRunning} />

      <div className="flex flex-col gap-2">
        <Label>Filter kind</Label>
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map((option) => {
            const isActive = option.value === kind
            return (
              <button key={option.value} type="button" disabled={isRunning} aria-pressed={isActive} onClick={() => setKind(option.value)} className={cn('rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60', isActive ? 'border-image bg-image-wash text-image' : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground')}>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-0.5 block text-xs opacity-80">{option.hint}</span>
              </button>
            )
          })}
        </div>
      </div>

      <ParamSlider label={isBand ? 'Lower cutoff' : 'Cutoff'} description="0 is DC, 1 is the edge of the spectrum." value={cutoff} min={0.02} max={1.4} step={0.01} disabled={isRunning} onChange={setCutoff} />
      {isBand ? <ParamSlider label="Upper cutoff" description="Must sit above the lower cutoff." value={highCutoff} min={0.02} max={1.4} step={0.01} disabled={isRunning} onChange={setHighCutoff} /> : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="filter-shape">Mask shape</Label>
        <Select value={filterShape} disabled={isRunning} onValueChange={(next) => setFilterShape(next as FilterShape)}>
          <SelectTrigger id="filter-shape"><SelectValue /></SelectTrigger>
          <SelectContent>{SHAPES.map((shape) => <SelectItem key={shape.value} value={shape.value}>{shape.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{SHAPE_NOTES[filterShape]}</p>
      </div>

      {filterShape === 'butterworth' ? <ParamSlider label="Order" description="Higher is a steeper roll-off, approaching the ideal mask." value={order} min={1} max={10} step={1} disabled={isRunning} onChange={setOrder} /> : null}
    </OperationShell>
  )
}
