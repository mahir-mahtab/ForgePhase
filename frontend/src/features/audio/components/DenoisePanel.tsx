import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_AUDIO } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import { SAMPLES } from '@/lib/samples'
import { AUDIO_DEFAULTS, denoiseAudio } from '@/services/audioService'

export function DenoisePanel() {
  const [file, setFile] = useState<File | null>(null)
  const [overSubtraction, setOverSubtraction] = useState<number>(AUDIO_DEFAULTS.overSubtraction)
  const [floor, setFloor] = useState<number>(AUDIO_DEFAULTS.floor)
  const [noiseFrames, setNoiseFrames] = useState<number>(AUDIO_DEFAULTS.noiseFrames)
  const { state, execute, reset } = useOperation(denoiseAudio)

  const isRunning = state.phase === 'running'

  const handleRun = useCallback(() => {
    if (!file) return
    void execute({ input: file, overSubtraction, floor, noiseFrames })
  }, [execute, file, floor, noiseFrames, overSubtraction])

  return (
    <OperationShell
      title="Remove background noise"
      description="Learns the noise from the start of the recording, then subtracts it from every frame's spectrum. Works best on steady noise (hiss, hum, fans) with a moment of silence at the start."
      runLabel="Denoise"
      canRun={file !== null}
      blockedReason="Choose an audio file."
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'denoise', file?.name ?? 'noisy.wav', 'denoised.wav',
        '--over-subtraction', overSubtraction, '--floor', floor, '--noise-frames', noiseFrames,
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The cleaned audio appears here. Compare it with the input player on the left."
        />
      }
    >
      <FileDropzone
        label="Noisy audio"
        kind="audio"
        accept={ACCEPT_AUDIO}
        file={file}
        onFileChange={setFile}
        disabled={isRunning}
        sample={SAMPLES.speechNoisy}
      />
      <ParamSlider
        label="Strength"
        description="How much of the estimated noise to remove. Above about 3 the remainder can sound watery."
        value={overSubtraction}
        min={1}
        max={5}
        step={0.1}
        disabled={isRunning}
        onChange={setOverSubtraction}
      />
      <ParamSlider
        label="Floor"
        description="Fraction of the original always kept. Higher sounds smoother but removes less."
        value={floor}
        min={0}
        max={0.5}
        step={0.01}
        disabled={isRunning}
        onChange={setFloor}
      />
      <ParamSlider
        label="Noise sample length"
        description="Frames from the start used to learn the noise; each covers 1024 samples."
        value={noiseFrames}
        min={1}
        max={30}
        step={1}
        unit="frames"
        disabled={isRunning}
        onChange={setNoiseFrames}
      />
    </OperationShell>
  )
}
