import { ArrowDown } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { SwitchField } from '@/components/shared/SwitchField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useImageSize } from '@/hooks/useImageSize'
import { useOperation } from '@/hooks/useOperation'
import { usePixelLimit } from '@/hooks/usePixelLimit'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import { PIXEL_LIMITS } from '@/lib/limits'
import { SAMPLES } from '@/lib/samples'
import { positionRange } from '@/lib/watermark'
import { IMAGE_DEFAULTS, embedWatermark, extractWatermark } from '@/services/imageService'

const STRENGTH_HELP = 'Higher survives more damage but is easier to see.'
const POSITION_HELP = 'Distance from the spectrum center, as a fraction of image height.'
const COLOUR_HELP = 'Mark each color channel. Slightly noisier.'

/** What the embed step hands to the extract step for a one-click check. */
interface ExtractInputs {
  original: File
  marked: File
  height: number
  width: number
  strength: number
  position: number
  colour: boolean
}

/**
 * The valid position range for the chosen files, and whether `position` is in
 * it. Unknown sizes (nothing picked yet, or an undecodable format) do not
 * block the run: the backend validates too.
 */
function usePositionCheck(
  image: File | null,
  markSize: { height: number; width: number } | null,
  position: number,
) {
  const imageSize = useImageSize(image)
  if (!imageSize || !markSize) return { range: null, fits: true, known: false }
  const range = positionRange(imageSize.height, imageSize.width, markSize.height, markSize.width)
  if (!range) return { range: null, fits: false, known: true }
  return { range, fits: position >= range.min && position <= range.max, known: true }
}

function RangeHint({
  check,
}: {
  check: ReturnType<typeof usePositionCheck>
}) {
  if (!check.known) return null
  if (!check.range) {
    return (
      <p className="text-xs text-destructive">
        The watermark is too large for this image. It must be under half the
        image height and no wider than the image.
      </p>
    )
  }
  return (
    <p className={check.fits ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
      For these files the position must be between {check.range.min.toFixed(3)} and{' '}
      {check.range.max.toFixed(3)}.
    </p>
  )
}

function EmbedPanel({
  onSendToExtract,
}: {
  onSendToExtract: (inputs: ExtractInputs) => void
}) {
  const [input, setInput] = useState<File | null>(null)
  const [watermark, setWatermark] = useState<File | null>(null)
  const [strength, setStrength] = useState<number>(IMAGE_DEFAULTS.watermarkStrength)
  const [position, setPosition] = useState<number>(IMAGE_DEFAULTS.watermarkPosition)
  const [colour, setColour] = useState(false)
  const { state, execute, reset } = useOperation(embedWatermark)

  const markSize = useImageSize(watermark)
  const check = usePositionCheck(
    input,
    markSize ? { height: markSize.height, width: markSize.width } : null,
    position,
  )

  const isRunning = state.phase === 'running'
  const sizeError = usePixelLimit(input, PIXEL_LIMITS.edit)
  const canRun = input !== null && watermark !== null && sizeError === null && check.fits
  const markReading = colour ? 'kept in colour' : 'read as greyscale'

  const handleRun = useCallback(() => {
    if (!input || !watermark) return
    void execute({ input, watermark, strength, position, colour })
  }, [colour, execute, input, position, strength, watermark])

  return (
    <OperationShell
      title="Embed a watermark"
      description="Embeds a mark in the spectrum. Keep the original for extraction."
      runLabel="Embed"
      canRun={canRun}
      blockedReason={
        input === null || watermark === null
          ? 'Choose an image and a watermark.'
          : sizeError
            ? 'Choose a smaller image.'
            : 'Adjust the position into the valid range.'
      }
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'watermark-embed',
        input?.name ?? 'input.png', watermark?.name ?? 'mark.png', 'watermarked.png',
        '--strength', strength, '--position', position,
        colour && '--colour',
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The watermarked image appears here. It should look almost identical to the original."
          actions={(result) =>
            input && markSize ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  onSendToExtract({
                    original: input,
                    marked: result.artifact.file,
                    height: markSize.height,
                    width: markSize.width,
                    strength,
                    position,
                    colour,
                  })
                }
              >
                Check with Extract
                <ArrowDown />
              </Button>
            ) : null
          }
        />
      }
    >
      <FileDropzone
        label="Image"
        kind="image"
        accept={ACCEPT_IMAGE}
        file={input}
        onFileChange={setInput}
        disabled={isRunning}
        sample={SAMPLES.watermarkImage}
        error={sizeError}
      />
      <FileDropzone
        label="Watermark"
        hint={markSize ? `${markSize.width} × ${markSize.height}, ${markReading}` : markReading}
        kind="image"
        accept={ACCEPT_IMAGE}
        file={watermark}
        onFileChange={setWatermark}
        disabled={isRunning}
        sample={SAMPLES.watermarkMark}
      />
      <ParamSlider
        label="Strength"
        description={STRENGTH_HELP}
        value={strength}
        min={0.05}
        max={1}
        step={0.01}
        disabled={isRunning}
        onChange={setStrength}
      />
      <div className="flex flex-col gap-1.5">
        <ParamSlider
          label="Position"
          description={POSITION_HELP}
          value={position}
          min={0.01}
          max={0.49}
          step={0.01}
          disabled={isRunning}
          onChange={setPosition}
        />
        <RangeHint check={check} />
      </div>
      <SwitchField
        label="Colour watermark"
        description={COLOUR_HELP}
        checked={colour}
        onCheckedChange={setColour}
        disabled={isRunning}
      />
    </OperationShell>
  )
}

function ExtractPanel({
  inputs,
}: {
  inputs: {
    original: File | null
    setOriginal: (file: File | null) => void
    marked: File | null
    setMarked: (file: File | null) => void
    height: string
    setHeight: (value: string) => void
    width: string
    setWidth: (value: string) => void
    strength: number
    setStrength: (value: number) => void
    position: number
    setPosition: (value: number) => void
    colour: boolean
    setColour: (value: boolean) => void
  }
}) {
  const { original, marked, height, width, strength, position, colour } = inputs
  const { state, execute, reset } = useOperation(extractWatermark)

  const isRunning = state.phase === 'running'
  const parsedHeight = Number(height)
  const parsedWidth = Number(width)
  const sizeValid =
    Number.isInteger(parsedHeight) && parsedHeight > 0 &&
    Number.isInteger(parsedWidth) && parsedWidth > 0
  const check = usePositionCheck(
    original,
    sizeValid ? { height: parsedHeight, width: parsedWidth } : null,
    position,
  )
  const canRun = original !== null && marked !== null && sizeValid && check.fits

  const handleRun = useCallback(() => {
    if (!original || !marked || !sizeValid) return
    void execute({
      original,
      marked,
      height: parsedHeight,
      width: parsedWidth,
      strength,
      position,
      colour,
    })
  }, [colour, execute, marked, original, parsedHeight, parsedWidth, position, sizeValid, strength])

  return (
    <OperationShell
      title="Extract a watermark"
      description="Settings must match those used to embed."
      runLabel="Extract"
      canRun={canRun}
      blockedReason={
        original === null || marked === null
          ? 'Choose the original and the watermarked image.'
          : !sizeValid
            ? 'Enter the watermark size in pixels.'
            : 'Adjust the position into the valid range.'
      }
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'watermark-extract',
        original?.name ?? 'original.png', marked?.name ?? 'watermarked.png', 'extracted.png',
        '--height', sizeValid ? parsedHeight : '?', '--width', sizeValid ? parsedWidth : '?',
        '--strength', strength, '--position', position,
        colour && '--colour',
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The recovered watermark appears here, contrast-stretched for display."
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FileDropzone
          label="Original image"
          kind="image"
          accept={ACCEPT_IMAGE}
          file={original}
          onFileChange={inputs.setOriginal}
          disabled={isRunning}
          sample={SAMPLES.watermarkOriginal}
        />
        <FileDropzone
          label="Watermarked image"
          kind="image"
          accept={ACCEPT_IMAGE}
          file={marked}
          onFileChange={inputs.setMarked}
          disabled={isRunning}
          sample={SAMPLES.watermarkMarked}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="watermark-width">Watermark width</Label>
          <Input
            id="watermark-width"
            type="number"
            min={1}
            inputMode="numeric"
            value={width}
            aria-invalid={!sizeValid}
            disabled={isRunning}
            onChange={(event) => inputs.setWidth(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="watermark-height">Watermark height</Label>
          <Input
            id="watermark-height"
            type="number"
            min={1}
            inputMode="numeric"
            value={height}
            aria-invalid={!sizeValid}
            disabled={isRunning}
            onChange={(event) => inputs.setHeight(event.target.value)}
          />
        </div>
      </div>

      <ParamSlider
        label="Strength"
        description="Must match the embed step."
        value={strength}
        min={0.05}
        max={1}
        step={0.01}
        disabled={isRunning}
        onChange={inputs.setStrength}
      />
      <div className="flex flex-col gap-1.5">
        <ParamSlider
          label="Position"
          description="Must match the embed step."
          value={position}
          min={0.01}
          max={0.49}
          step={0.01}
          disabled={isRunning}
          onChange={inputs.setPosition}
        />
        <RangeHint check={check} />
      </div>
      <SwitchField
        label="Colour watermark"
        description="Must match the embed step."
        checked={colour}
        onCheckedChange={inputs.setColour}
        disabled={isRunning}
      />
    </OperationShell>
  )
}

export function WatermarkPanel() {
  // Extract inputs live here so a finished embed can fill them in.
  const [original, setOriginal] = useState<File | null>(null)
  const [marked, setMarked] = useState<File | null>(null)
  const [height, setHeight] = useState('32')
  const [width, setWidth] = useState('32')
  const [strength, setStrength] = useState<number>(IMAGE_DEFAULTS.watermarkStrength)
  const [position, setPosition] = useState<number>(IMAGE_DEFAULTS.watermarkPosition)
  const [colour, setColour] = useState(false)

  const sendToExtract = useCallback((inputs: ExtractInputs) => {
    setOriginal(inputs.original)
    setMarked(inputs.marked)
    setHeight(String(inputs.height))
    setWidth(String(inputs.width))
    setStrength(inputs.strength)
    setPosition(inputs.position)
    setColour(inputs.colour)
    document.getElementById('watermark-extract')?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <EmbedPanel onSendToExtract={sendToExtract} />
      <div id="watermark-extract" className="scroll-mt-20">
        <ExtractPanel
          inputs={{
            original, setOriginal, marked, setMarked, height, setHeight,
            width, setWidth, strength, setStrength, position, setPosition,
            colour, setColour,
          }}
        />
      </div>
    </div>
  )
}
