import { ArrowDown } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { Button } from '@/components/ui/button'
import { useOperation } from '@/hooks/useOperation'
import { usePixelLimit } from '@/hooks/usePixelLimit'
import { cliCommand } from '@/lib/cli'
import { PIXEL_LIMITS } from '@/lib/limits'
import type { Sample } from '@/lib/samples'
import type {
  ArtifactResult,
  ServiceResult,
  WatermarkEmbedRequest,
  WatermarkExtractRequest,
} from '@/services/types'

/** Everything that differs between the image and audio watermark tools. */
export interface WatermarkConfig {
  kind: 'image' | 'audio'
  accept: string
  /** CLI command prefix, e.g. `watermark` or `audio-watermark`. */
  command: string
  ext: string
  embed: (request: WatermarkEmbedRequest) => Promise<ServiceResult<ArtifactResult>>
  extract: (request: WatermarkExtractRequest) => Promise<ServiceResult<ArtifactResult>>
  labels: { carrier: string; mark: string }
  markHint: string
  embedHint: string
  extractHint: string
  samples: { carrier: Sample; mark: Sample; original: Sample; marked: Sample }
}

function EmbedPanel({
  config,
  onSendToExtract,
}: {
  config: WatermarkConfig
  onSendToExtract: (original: File, marked: File) => void
}) {
  const [input, setInput] = useState<File | null>(null)
  const [watermark, setWatermark] = useState<File | null>(null)
  const { state, execute, reset } = useOperation(config.embed)

  const isRunning = state.phase === 'running'
  const isImage = config.kind === 'image'
  const inputError = usePixelLimit(isImage ? input : null, PIXEL_LIMITS.edit)
  const markError = usePixelLimit(isImage ? watermark : null, PIXEL_LIMITS.edit)
  const missing = input === null || watermark === null
  const canRun = !missing && inputError === null && markError === null

  const handleRun = useCallback(() => {
    if (!input || !watermark) return
    void execute({ input, watermark })
  }, [execute, input, watermark])

  return (
    <OperationShell
      title="Embed a watermark"
      description={`Hides the watermark in the ${config.labels.carrier.toLowerCase()}. Keep the original for extraction.`}
      runLabel="Embed"
      canRun={canRun}
      blockedReason={
        missing
          ? `Choose the ${config.labels.carrier.toLowerCase()} and a watermark.`
          : 'Choose a smaller image.'
      }
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', `${config.command}-embed`,
        input?.name ?? `input.${config.ext}`, watermark?.name ?? `mark.${config.ext}`,
        `watermarked.${config.ext}`,
      )}
      result={
        <ResultPanel
          state={state}
          idleHint={config.embedHint}
          actions={(result) =>
            input ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => onSendToExtract(input, result.artifact.file)}
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
        label={config.labels.carrier}
        kind={config.kind}
        accept={config.accept}
        file={input}
        onFileChange={setInput}
        disabled={isRunning}
        sample={config.samples.carrier}
        error={inputError}
      />
      <FileDropzone
        label={config.labels.mark}
        hint={config.markHint}
        kind={config.kind}
        accept={config.accept}
        file={watermark}
        onFileChange={setWatermark}
        disabled={isRunning}
        sample={config.samples.mark}
        error={markError}
      />
    </OperationShell>
  )
}

function ExtractPanel({
  config,
  original,
  onOriginalChange,
  marked,
  onMarkedChange,
}: {
  config: WatermarkConfig
  original: File | null
  onOriginalChange: (file: File | null) => void
  marked: File | null
  onMarkedChange: (file: File | null) => void
}) {
  const { state, execute, reset } = useOperation(config.extract)
  const isRunning = state.phase === 'running'

  const handleRun = useCallback(() => {
    if (!original || !marked) return
    void execute({ original, marked })
  }, [execute, marked, original])

  const carrier = config.labels.carrier.toLowerCase()

  return (
    <OperationShell
      title="Extract a watermark"
      description={`Compares the watermarked ${carrier} with the original.`}
      runLabel="Extract"
      canRun={original !== null && marked !== null}
      blockedReason={`Choose the original and the watermarked ${carrier}.`}
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', `${config.command}-extract`,
        original?.name ?? `original.${config.ext}`, marked?.name ?? `watermarked.${config.ext}`,
        `extracted.${config.ext}`,
      )}
      result={<ResultPanel state={state} idleHint={config.extractHint} />}
    >
      <FileDropzone
        label={`Original ${carrier}`}
        kind={config.kind}
        accept={config.accept}
        file={original}
        onFileChange={onOriginalChange}
        disabled={isRunning}
        sample={config.samples.original}
      />
      <FileDropzone
        label={`Watermarked ${carrier}`}
        kind={config.kind}
        accept={config.accept}
        file={marked}
        onFileChange={onMarkedChange}
        disabled={isRunning}
        sample={config.samples.marked}
      />
    </OperationShell>
  )
}

export function WatermarkTool({ config }: { config: WatermarkConfig }) {
  // Extract inputs live here so a finished embed can fill them in.
  const [original, setOriginal] = useState<File | null>(null)
  const [marked, setMarked] = useState<File | null>(null)
  const extractId = `${config.kind}-watermark-extract`

  const sendToExtract = useCallback((source: File, result: File) => {
    setOriginal(source)
    setMarked(result)
    document.getElementById(extractId)?.scrollIntoView({ behavior: 'smooth' })
  }, [extractId])

  return (
    <div className="flex flex-col gap-6">
      <EmbedPanel config={config} onSendToExtract={sendToExtract} />
      <div id={extractId} className="scroll-mt-20">
        <ExtractPanel
          config={config}
          original={original}
          onOriginalChange={setOriginal}
          marked={marked}
          onMarkedChange={setMarked}
        />
      </div>
    </div>
  )
}
