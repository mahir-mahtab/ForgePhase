import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { KeySelector } from '@/components/shared/KeySelector'
import { MetricsTable } from '@/components/shared/MetricsTable'
import { OperationShell } from '@/components/shared/OperationShell'
import { ReportState } from '@/components/shared/ReportState'
import { useKeyInput } from '@/hooks/useKeyInput'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_AUDIO, ACCEPT_CIPHER_WAV } from '@/lib/accept'
import { cliCommand, keyCliArgs } from '@/lib/cli'
import { SAMPLES } from '@/lib/samples'
import { audioRobustnessReport } from '@/services/audioService'

export function AudioRobustnessPanel() {
  const [ciphertext, setCiphertext] = useState<File | null>(null)
  const [original, setOriginal] = useState<File | null>(null)
  const key = useKeyInput()
  const { state, execute, reset } = useOperation(audioRobustnessReport)

  const isRunning = state.phase === 'running'
  const canRun = ciphertext !== null && original !== null && key.hasKey
  const blockedReason =
    ciphertext === null || original === null
      ? 'Choose the encrypted audio and the original.'
      : key.missingReason

  const handleRun = useCallback(() => {
    if (!ciphertext || !original) return
    void execute({ ciphertext, original, ...key.options })
  }, [ciphertext, execute, key.options, original])

  return (
    <OperationShell
      title="Robustness report"
      description="Damages the encrypted audio in several ways (noise, coarse quantization), decrypts each copy with the correct key, and scores the result against the original recording."
      runLabel="Run report"
      canRun={canRun}
      blockedReason={blockedReason}
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'attack-report',
        ciphertext?.name ?? 'cipher.wav', original?.name ?? 'original.wav',
        ...keyCliArgs(key.options.keyMode, key.options.keyFile),
      )}
      result={
        <ReportState
          state={state}
          idleHint="A table of how much of the audio survives each kind of damage."
          render={(report) => <MetricsTable report={report} />}
        />
      }
    >
      <FileDropzone
        label="Encrypted audio"
        hint="the noisy cipher.wav"
        kind="audio"
        accept={ACCEPT_CIPHER_WAV}
        file={ciphertext}
        onFileChange={setCiphertext}
        disabled={isRunning}
        sample={SAMPLES.audioAnalysisCipher}
        onSampleLoaded={key.applySampleKey}
      />
      <FileDropzone
        label="Original audio"
        hint="the recording before encryption"
        kind="audio"
        accept={ACCEPT_AUDIO}
        file={original}
        onFileChange={setOriginal}
        disabled={isRunning}
        sample={SAMPLES.audioAnalysisOriginal}
      />
      <KeySelector {...key.selectorProps} disabled={isRunning} />
    </OperationShell>
  )
}
