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
      description="Tracks the noise spectrum through the whole recording with a speech-presence-probability estimator, then applies the OM-LSA gain: log-spectral amplitude where speech is likely, a bounded floor where it is not. Copes with noise that changes over time and needs no silent lead-in."
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
        description="The most a noise-only bin is turned down. Higher is quieter between words; past about 30 dB the background can sound gated."
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
        description="Weight of the decision-directed SNR estimate. Higher leaves a steadier, less warbly residual but softens consonant onsets."
        value={smoothing}
        min={0.8}
        max={0.995}
        step={0.005}
        disabled={isRunning}
        onChange={setSmoothing}
      />
      <ParamSlider
        label="Noise seed"
        description="Frames from the start that seed the noise tracker, which then follows the noise on its own; each covers 1024 samples."
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
