import { Waves } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { Button } from '@/components/ui/button'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { IMAGE_DEFAULTS, renderSpectrum } from '@/services/imageService'
import type { TransformBackend } from '@/services/types'

const ICON = <Waves className="size-4" aria-hidden />

export function SpectrumPanel({ backend }: { backend: TransformBackend }) {
  const [input, setInput] = useState<File | null>(null)
  const [imaginaryFile, setImaginaryFile] = useState<File | null>(null)
  const [sourceMode, setSourceMode] = useState<'image' | 'pair'>('image')
  const [gamma, setGamma] = useState<number>(IMAGE_DEFAULTS.spectrumGamma)
  const { state, execute, reset } = useOperation(renderSpectrum)

  const isRunning = state.phase === 'running'
  const canRun = sourceMode === 'image'
    ? input !== null
    : input !== null && imaginaryFile !== null

  const handleRun = useCallback(() => {
    if (!input) return
    if (sourceMode === 'pair' && !imaginaryFile) return
    void execute({
      input,
      imaginaryFile: sourceMode === 'pair' ? imaginaryFile ?? undefined : undefined,
      gamma,
      backend,
    })
  }, [backend, execute, gamma, imaginaryFile, input, sourceMode])

  const command = [
    'phaseforge --backend',
    backend,
    'spectrum',
    input?.name ?? '<input>',
    'spectrum.png',
    ...(sourceMode === 'pair'
      ? ['--imaginary', imaginaryFile?.name ?? '<cipher-imaginary.png>']
      : []),
    '--gamma',
    gamma,
  ].join(' ')

  return (
    <OperationShell
      tone="image"
      icon={ICON}
      title="Magnitude spectrum"
      description="A raw complex spectrum cannot go into an image tag, so this renders the log-scaled magnitude instead. Choose an ordinary image or a real/imaginary cipher pair."
      command="spectrum"
      runLabel="Render spectrum"
      canRun={canRun}
      blockedReason={sourceMode === 'image' ? 'Pick an image' : 'Pick both cipher PNGs'}
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      result={
        <ResultPanel
          state={state}
          tone="image"
          idleHint="The spectrum preview appears here. DC sits at the centre after shifting."
          cliCommand={command}
        />
      }
    >
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={sourceMode === 'image' ? 'image' : 'outline'}
          aria-pressed={sourceMode === 'image'}
          onClick={() => setSourceMode('image')}
          disabled={isRunning}
        >
          Ordinary image
        </Button>
        <Button
          type="button"
          size="sm"
          variant={sourceMode === 'pair' ? 'image' : 'outline'}
          aria-pressed={sourceMode === 'pair'}
          onClick={() => setSourceMode('pair')}
          disabled={isRunning}
        >
          Cipher pair
        </Button>
      </div>
      <FileDropzone
        label={sourceMode === 'image' ? 'Source image' : 'Real cipher component'}
        hint={sourceMode === 'image' ? 'image' : 'cipher-real.png'}
        kind="image"
        accept={ACCEPT_IMAGE}
        tone="image"
        file={input}
        onFileChange={setInput}
        disabled={isRunning}
      />

      {sourceMode === 'pair' ? (
        <FileDropzone
          label="Imaginary cipher component"
          hint="cipher-imaginary.png"
          kind="image"
          accept={ACCEPT_IMAGE}
          tone="image"
          file={imaginaryFile}
          onFileChange={setImaginaryFile}
          disabled={isRunning}
        />
      ) : null}

      <ParamSlider
        label="Display gamma"
        description="Applied to the log-scaled magnitude. Below 1 lifts the faint high-frequency detail; above 1 pushes it down."
        value={gamma}
        min={0.2}
        max={3}
        step={0.05}
        disabled={isRunning}
        onChange={setGamma}
      />
    </OperationShell>
  )
}
