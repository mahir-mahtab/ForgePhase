import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import { SAMPLES } from '@/lib/samples'
import { IMAGE_DEFAULTS, renderSpectrum } from '@/services/imageService'
import type { TransformBackend } from '@/services/types'

export function SpectrumPanel({ backend }: { backend: TransformBackend }) {
  const [image, setImage] = useState<File | null>(null)
  const [gamma, setGamma] = useState<number>(IMAGE_DEFAULTS.spectrumGamma)
  const { state, execute, reset } = useOperation(renderSpectrum)

  const isRunning = state.phase === 'running'
  const canRun = image !== null

  const handleRun = useCallback(() => {
    if (image) void execute({ input: image, gamma, backend })
  }, [backend, execute, gamma, image])

  return (
    <OperationShell
      title="Magnitude spectrum"
      description="Shows the log-scaled magnitude of the 2D Fourier transform, with the lowest frequencies at the centre. Give it an encrypted image and it shows the ciphertext itself, which should look like flat noise."
      runLabel="Show spectrum"
      canRun={canRun}
      blockedReason="Choose an image."
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', '--backend', backend, 'spectrum',
        image?.name ?? 'input.png', 'spectrum.png',
        '--gamma', gamma,
      )}
      result={<ResultPanel state={state} idleHint="The spectrum image appears here." />}
    >
      <FileDropzone
        label="Image"
        hint="an ordinary image or an encrypted cipher.png"
        kind="image"
        accept={ACCEPT_IMAGE}
        file={image}
        onFileChange={setImage}
        disabled={isRunning}
        sample={SAMPLES.image}
      />

      <ParamSlider
        label="Display gamma"
        description="Below 1 brings out faint high frequencies; above 1 darkens them."
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
