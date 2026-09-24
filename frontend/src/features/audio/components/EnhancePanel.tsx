import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_AUDIO } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import { SAMPLES } from '@/lib/samples'
import { AUDIO_DEFAULTS, enhanceAudio } from '@/services/audioService'

export function EnhancePanel() {
  const [file, setFile] = useState<File | null>(null)
  const [boost, setBoost] = useState<number>(AUDIO_DEFAULTS.boost)
  const [gateThreshold, setGateThreshold] = useState<number>(AUDIO_DEFAULTS.gateThreshold)
  const [gateFloor, setGateFloor] = useState<number>(AUDIO_DEFAULTS.gateFloor)
  const { state, execute, reset } = useOperation(enhanceAudio)

  const isRunning = state.phase === 'running'

  const handleRun = useCallback(() => {
    if (!file) return
    void execute({ input: file, boost, gateThreshold, gateFloor })
  }, [boost, execute, file, gateFloor, gateThreshold])

  return (
    <OperationShell
      title="Enhance speech"
      description="Boosts the 300–3400 Hz band where most of speech's intelligibility lives, and turns down quiet frequency bins between words."
      runLabel="Enhance"
      canRun={file !== null}
      blockedReason="Choose an audio file."
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'enhance', file?.name ?? 'speech.wav', 'enhanced.wav',
        '--boost', boost, '--gate-threshold', gateThreshold, '--gate-floor', gateFloor,
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The enhanced audio appears here, at the input's sample rate."
        />
      }
    >
      <FileDropzone
        label="Speech recording"
        kind="audio"
        accept={ACCEPT_AUDIO}
        file={file}
        onFileChange={setFile}
        disabled={isRunning}
        sample={SAMPLES.speechNoisy}
      />
      <ParamSlider
        label="Speech boost"
        description="Gain for the speech band. High values sound thin."
        value={boost}
        min={1}
        max={6}
        step={0.1}
        unit="×"
        disabled={isRunning}
        onChange={setBoost}
      />
      <ParamSlider
        label="Gate threshold"
        description="Bins quieter than this multiple of each frame's median level are turned down."
        value={gateThreshold}
        min={0}
        max={5}
        step={0.1}
        disabled={isRunning}
        onChange={setGateThreshold}
      />
      <ParamSlider
        label="Gate level"
        description="How much of a gated bin is kept: 0 silences it, 1 leaves it alone."
        value={gateFloor}
        min={0}
        max={1}
        step={0.05}
        disabled={isRunning}
        onChange={setGateFloor}
      />
    </OperationShell>
  )
}
