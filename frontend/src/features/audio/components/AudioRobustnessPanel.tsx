import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { MetricsTable } from '@/components/shared/MetricsTable'
import { OperationShell } from '@/components/shared/OperationShell'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { ReportState } from '@/components/shared/ReportState'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_AUDIO, ACCEPT_CIPHER_WAV } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import { audioRobustnessReport } from '@/services/audioService'

export function AudioRobustnessPanel() {
  const [ciphertext, setCiphertext] = useState<File | null>(null)
  const [original, setOriginal] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const { state, execute, reset } = useOperation(audioRobustnessReport)

  const isRunning = state.phase === 'running'
  const canRun = ciphertext !== null && original !== null && passphrase.length > 0

  const handleRun = useCallback(() => {
    if (!ciphertext || !original) return
    void execute({ ciphertext, original, passphrase })
  }, [ciphertext, execute, original, passphrase])

  return (
    <OperationShell
      title="Robustness report"
      description="Damages the encrypted audio with noise and coarse quantization, decrypts each copy with the correct passphrase, and scores the result against the original recording."
      runLabel="Run report"
      canRun={canRun}
      blockedReason="Add the encrypted audio, the original audio and the passphrase."
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'attack-report',
        ciphertext?.name ?? 'cipher.wav', original?.name ?? 'original.wav',
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
      />
      <FileDropzone
        label="Original audio"
        hint="the unencrypted file"
        kind="audio"
        accept={ACCEPT_AUDIO}
        file={original}
        onFileChange={setOriginal}
        disabled={isRunning}
      />
      <PassphraseField
        value={passphrase}
        onChange={setPassphrase}
        hint="The passphrase used to encrypt."
        disabled={isRunning}
      />
    </OperationShell>
  )
}
