import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { SpectrumCompare } from '@/components/shared/SpectrumCompare'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_AUDIO } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import { SAMPLES } from '@/lib/samples'
import { AUDIO_DEFAULTS, denoiseAudio } from '@/services/audioService'

export function DenoisePanel() {
  const [file, setFile] = useState<File | null>(null)
  const [reductionDb, setReductionDb] = useState<number>(AUDIO_DEFAULTS.denoiseReductionDb)
  const [smoothing, setSmoothing] = useState<number>(AUDIO_DEFAULTS.smoothing)
  const [noiseFrames, setNoiseFrames] = useState<number>(AUDIO_DEFAULTS.noiseFrames)
  // The file the shown result came from, so picking a new one does not skew the comparison.
  const [source, setSource] = useState<File | null>(null)
  const { state, execute, reset } = useOperation(denoiseAudio)

  const isRunning = state.phase === 'running'

  const handleRun = useCallback(() => {
    if (!file) return
    setSource(file)
    void execute({ input: file, reductionDb, smoothing, noiseFrames })
  }, [execute, file, noiseFrames, reductionDb, smoothing])

  return (
    <OperationShell
      title="Remove background noise"
      description="Estimates and suppresses background noise."
      runLabel="Denoise"
      canRun={file !== null}
      blockedReason="Choose an audio file."
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'denoise', file?.name ?? 'noisy.wav', 'denoised.wav',
        '--reduction-db', reductionDb, '--smoothing', smoothing, '--noise-frames', noiseFrames,
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The cleaned audio appears here, with spectrograms and the average spectrum before and after."
          note={
            state.phase === 'ok' && source ? (
              <SpectrumCompare
                input={source}
                output={state.data.artifact.file}
                outputLabel="Denoised"
              />
            ) : null
          }
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
        sample={SAMPLES.denoise}
      />
      <ParamSlider
        label="Max reduction"
        description="Maximum noise reduction. Very high can sound gated."
        value={reductionDb}
        min={3}
        max={40}
        step={1}
        unit="dB"
        disabled={isRunning}
        onChange={setReductionDb}
      />
      <ParamSlider
        label="Smoothing"
        description="Higher is steadier but softens consonants."
        value={smoothing}
        min={0.8}
        max={0.995}
        step={0.005}
        disabled={isRunning}
        onChange={setSmoothing}
      />
      <ParamSlider
        label="Noise seed"
        description="Initial frames used to estimate noise."
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
