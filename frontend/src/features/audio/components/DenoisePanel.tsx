import { Eraser } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_AUDIO } from '@/lib/accept'
import { AUDIO_DEFAULTS, denoiseAudio } from '@/services/audioService'
import type { TransformBackend } from '@/services/types'

const ICON = <Eraser className="size-4" aria-hidden />

export function DenoisePanel({ backend }: { backend: TransformBackend }) {
  const [file, setFile] = useState<File | null>(null)
  const [overSubtraction, setOverSubtraction] = useState<number>(
    AUDIO_DEFAULTS.overSubtraction,
  )
  const [floor, setFloor] = useState<number>(AUDIO_DEFAULTS.floor)
  const { state, execute, reset } = useOperation(denoiseAudio)

  const isRunning = state.phase === 'running'
  const canRun = file !== null

  const handleRun = useCallback(() => {
    if (!file) return
    void execute({ input: file, overSubtraction, floor, backend })
  }, [backend, execute, file, floor, overSubtraction])

  const command = [
    'phaseforge --backend',
    backend,
    'denoise',
    file?.name ?? '<noisy.wav>',
    'denoised.wav --over-subtraction',
    overSubtraction,
    '--floor',
    floor,
  ].join(' ')

  return (
    <OperationShell
      tone="audio"
      icon={ICON}
      title="Spectral subtraction"
      description="Estimates the noise floor from the quietest frames, then subtracts it from every frame's magnitude while keeping the original phase."
      command="denoise"
      runLabel="Denoise"
      canRun={canRun}
      blockedReason="Pick an audio file"
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      result={
        <ResultPanel
          state={state}
          tone="audio"
          idleHint="The cleaned waveform appears here. Compare it against the input above."
          cliCommand={command}
        />
      }
    >
      <FileDropzone
        label="Noisy audio"
        kind="audio"
        accept={ACCEPT_AUDIO}
        tone="audio"
        file={file}
        onFileChange={setFile}
        disabled={isRunning}
      />

      <ParamSlider
        label="Over-subtraction"
        description="How much more than the estimated floor to remove. Past roughly 3 the residue starts to sound like musical noise."
        value={overSubtraction}
        min={0.5}
        max={5}
        step={0.1}
        disabled={isRunning}
        onChange={setOverSubtraction}
      />

      <ParamSlider
        label="Spectral floor"
        description="Lower bound on the subtracted magnitude, as a fraction of the original. Raising it trades noise reduction for a smoother residue."
        value={floor}
        min={0.005}
        max={0.5}
        step={0.005}
        precision={3}
        disabled={isRunning}
        onChange={setFloor}
      />
    </OperationShell>
  )
}
