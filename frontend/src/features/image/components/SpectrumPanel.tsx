import { Waves } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_CONTAINER, ACCEPT_IMAGE } from '@/lib/accept'
import { IMAGE_DEFAULTS, renderSpectrum } from '@/services/imageService'
import type { TransformBackend } from '@/services/types'

const ICON = <Waves className="size-4" aria-hidden />

/** Accepts a plain image or a ciphertext container, exactly as the CLI does. */
const ACCEPT_EITHER = `${ACCEPT_IMAGE},${ACCEPT_CONTAINER}`

export function SpectrumPanel({ backend }: { backend: TransformBackend }) {
  const [input, setInput] = useState<File | null>(null)
  const [gamma, setGamma] = useState<number>(IMAGE_DEFAULTS.spectrumGamma)
  const { state, execute, reset } = useOperation(renderSpectrum)

  const isRunning = state.phase === 'running'
  const canRun = input !== null

  const handleRun = useCallback(() => {
    if (!input) return
    void execute({ input, gamma, backend })
  }, [backend, execute, gamma, input])

  const command = [
    'phaseforge --backend',
    backend,
    'spectrum',
    input?.name ?? '<input>',
    'spectrum.png --gamma',
    gamma,
  ].join(' ')

  return (
    <OperationShell
      tone="image"
      icon={ICON}
      title="Magnitude spectrum"
      description="A raw complex spectrum cannot go into an image tag, so this renders the log-scaled magnitude instead. Point it at a ciphertext container to see that DRPE output really is noise-like."
      command="spectrum"
      runLabel="Render spectrum"
      canRun={canRun}
      blockedReason="Pick an image or a .npz container"
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
      <FileDropzone
        label="Image or container"
        hint="image or .npz"
        kind="image"
        accept={ACCEPT_EITHER}
        tone="image"
        file={input}
        onFileChange={setInput}
        disabled={isRunning}
      />

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
