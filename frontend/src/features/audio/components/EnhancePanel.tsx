import { Sparkles } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_AUDIO } from '@/lib/accept'
import { AUDIO_DEFAULTS, enhanceAudio } from '@/services/audioService'
import type { TransformBackend } from '@/services/types'

const ICON = <Sparkles className="size-4" aria-hidden />

export function EnhancePanel({ backend }: { backend: TransformBackend }) {
  const [file, setFile] = useState<File | null>(null)
  const [boost, setBoost] = useState<number>(AUDIO_DEFAULTS.boost)
  const [gateThreshold, setGateThreshold] = useState<number>(
    AUDIO_DEFAULTS.gateThreshold,
  )
  const { state, execute, reset } = useOperation(enhanceAudio)

  const isRunning = state.phase === 'running'
  const canRun = file !== null

  const handleRun = useCallback(() => {
    if (!file) return
    void execute({ input: file, boost, gateThreshold, backend })
  }, [backend, boost, execute, file, gateThreshold])

  const command = [
    'phaseforge --backend',
    backend,
    'enhance',
    file?.name ?? '<speech.wav>',
    'enhanced.wav --boost',
    boost,
    '--gate-threshold',
    gateThreshold,
  ].join(' ')

  return (
    <OperationShell
      tone="audio"
      icon={ICON}
      title="Speech enhancement"
      description="Lifts the speech band and gates everything below the noise floor, so consonants carry without the gaps between words getting louder too."
      command="enhance"
      runLabel="Enhance"
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
          idleHint="The enhanced waveform appears here, at the input's own sample rate."
          cliCommand={command}
        />
      }
    >
      <FileDropzone
        label="Speech audio"
        kind="audio"
        accept={ACCEPT_AUDIO}
        tone="audio"
        file={file}
        onFileChange={setFile}
        disabled={isRunning}
      />

      <ParamSlider
        label="Speech-band boost"
        description="Gain applied across the intelligibility band. High values start to sound thin and brittle."
        value={boost}
        min={1}
        max={6}
        step={0.1}
        disabled={isRunning}
        onChange={setBoost}
      />

      <ParamSlider
        label="Gate threshold"
        description="Multiples of the estimated noise floor a frame must exceed to pass. Too high and quiet syllables are cut off."
        value={gateThreshold}
        min={0.5}
        max={5}
        step={0.1}
        disabled={isRunning}
        onChange={setGateThreshold}
      />
    </OperationShell>
  )
}
