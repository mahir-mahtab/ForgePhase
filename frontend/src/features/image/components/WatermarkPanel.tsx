import { ScanSearch, Stamp } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_IMAGE } from '@/lib/accept'
import {
  IMAGE_DEFAULTS,
  embedWatermark,
  extractWatermark,
} from '@/services/imageService'
import type { TransformBackend } from '@/services/types'

const EMBED_ICON = <Stamp className="size-4" aria-hidden />
const EXTRACT_ICON = <ScanSearch className="size-4" aria-hidden />

const STRENGTH_HELP =
  'Embedding gain. Higher survives more compression and cropping, and is easier to see.'
const POSITION_HELP =
  'Radial placement as a fraction of the Nyquist limit. Mid-band hides best: low is visible, high is destroyed by compression.'

function EmbedPanel({ backend }: { backend: TransformBackend }) {
  const [input, setInput] = useState<File | null>(null)
  const [watermark, setWatermark] = useState<File | null>(null)
  const [strength, setStrength] = useState<number>(
    IMAGE_DEFAULTS.watermarkStrength,
  )
  const [position, setPosition] = useState<number>(
    IMAGE_DEFAULTS.watermarkPosition,
  )
  const { state, execute, reset } = useOperation(embedWatermark)

  const isRunning = state.phase === 'running'
  const canRun = input !== null && watermark !== null

  const handleRun = useCallback(() => {
    if (!input || !watermark) return
    void execute({ input, watermark, strength, position, backend })
  }, [backend, execute, input, position, strength, watermark])

  const command = [
    'phaseforge --backend',
    backend,
    'watermark-embed',
    input?.name ?? '<input>',
    watermark?.name ?? '<mark>',
    'marked.png --strength',
    strength,
    '--position',
    position,
  ].join(' ')

  return (
    <OperationShell
      tone="image"
      icon={EMBED_ICON}
      title="Embed a watermark"
      description="Writes the mark into the magnitude spectrum at a fixed radius, so it survives operations that leave the spectrum broadly intact."
      command="watermark-embed"
      runLabel="Embed watermark"
      canRun={canRun}
      blockedReason="Pick a carrier image and a watermark"
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      result={
        <ResultPanel
          state={state}
          tone="image"
          idleHint="The marked image appears here. Keep the original: extraction needs both."
          cliCommand={command}
        />
      }
    >
      <FileDropzone
        label="Carrier image"
        kind="image"
        accept={ACCEPT_IMAGE}
        tone="image"
        file={input}
        onFileChange={setInput}
        disabled={isRunning}
      />

      <FileDropzone
        label="Watermark"
        hint="read as greyscale"
        kind="image"
        accept={ACCEPT_IMAGE}
        tone="image"
        file={watermark}
        onFileChange={setWatermark}
        disabled={isRunning}
      />

      <ParamSlider
        label="Strength"
        description={STRENGTH_HELP}
        value={strength}
        min={0.01}
        max={1}
        step={0.01}
        disabled={isRunning}
        onChange={setStrength}
      />

      <ParamSlider
        label="Position"
        description={POSITION_HELP}
        value={position}
        min={0.05}
        max={0.95}
        step={0.01}
        disabled={isRunning}
        onChange={setPosition}
      />
    </OperationShell>
  )
}

function ExtractPanel({ backend }: { backend: TransformBackend }) {
  const [original, setOriginal] = useState<File | null>(null)
  const [marked, setMarked] = useState<File | null>(null)
  const [height, setHeight] = useState('64')
  const [width, setWidth] = useState('64')
  const [strength, setStrength] = useState<number>(
    IMAGE_DEFAULTS.watermarkStrength,
  )
  const [position, setPosition] = useState<number>(
    IMAGE_DEFAULTS.watermarkPosition,
  )
  const { state, execute, reset } = useOperation(extractWatermark)

  const isRunning = state.phase === 'running'

  // Parsed during render. Empty and non-numeric input both land on NaN, which
  // the guards below reject without a separate validity flag to keep in sync.
  const parsedHeight = Number.parseInt(height, 10)
  const parsedWidth = Number.parseInt(width, 10)
  const heightValid = Number.isInteger(parsedHeight) && parsedHeight > 0
  const widthValid = Number.isInteger(parsedWidth) && parsedWidth > 0
  const canRun = original !== null && marked !== null && heightValid && widthValid

  const handleRun = useCallback(() => {
    if (!original || !marked || !heightValid || !widthValid) return
    void execute({
      original,
      marked,
      height: parsedHeight,
      width: parsedWidth,
      strength,
      position,
      backend,
    })
  }, [
    backend,
    execute,
    heightValid,
    marked,
    original,
    parsedHeight,
    parsedWidth,
    position,
    strength,
    widthValid,
  ])

  const command = [
    'phaseforge --backend',
    backend,
    'watermark-extract',
    original?.name ?? '<original>',
    marked?.name ?? '<marked>',
    'extracted.png --height',
    heightValid ? parsedHeight : '?',
    '--width',
    widthValid ? parsedWidth : '?',
    '--strength',
    strength,
    '--position',
    position,
  ].join(' ')

  return (
    <OperationShell
      tone="image"
      icon={EXTRACT_ICON}
      title="Extract a watermark"
      description="Differences the marked spectrum against the original. The mark's own dimensions cannot be inferred, so they have to be supplied."
      command="watermark-extract"
      runLabel="Extract watermark"
      canRun={canRun}
      blockedReason="Needs both images and a positive watermark size"
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      result={
        <ResultPanel
          state={state}
          tone="image"
          idleHint="The recovered mark appears here, normalised for display."
          cliCommand={command}
        />
      }
    >
      <FileDropzone
        label="Original image"
        kind="image"
        accept={ACCEPT_IMAGE}
        tone="image"
        file={original}
        onFileChange={setOriginal}
        disabled={isRunning}
      />

      <FileDropzone
        label="Marked image"
        kind="image"
        accept={ACCEPT_IMAGE}
        tone="image"
        file={marked}
        onFileChange={setMarked}
        disabled={isRunning}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="watermark-height">Watermark height</Label>
          <Input
            id="watermark-height"
            inputMode="numeric"
            value={height}
            aria-invalid={!heightValid}
            disabled={isRunning}
            onChange={(event) => setHeight(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="watermark-width">Watermark width</Label>
          <Input
            id="watermark-width"
            inputMode="numeric"
            value={width}
            aria-invalid={!widthValid}
            disabled={isRunning}
            onChange={(event) => setWidth(event.target.value)}
          />
        </div>
      </div>

      <ParamSlider
        label="Strength"
        description="Must match the value used at embed time."
        value={strength}
        min={0.01}
        max={1}
        step={0.01}
        disabled={isRunning}
        onChange={setStrength}
      />

      <ParamSlider
        label="Position"
        description="Must match the value used at embed time."
        value={position}
        min={0.05}
        max={0.95}
        step={0.01}
        disabled={isRunning}
        onChange={setPosition}
      />
    </OperationShell>
  )
}

export function WatermarkPanel({ backend }: { backend: TransformBackend }) {
  return (
    <div className="flex flex-col gap-6">
      <EmbedPanel backend={backend} />
      <ExtractPanel backend={backend} />
    </div>
  )
}
