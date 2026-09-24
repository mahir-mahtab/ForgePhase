import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_CIPHER_WAV } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import { decryptAudio } from '@/services/audioService'

interface AudioDecryptPanelProps {
  container: File | null
  onContainerChange: (file: File | null) => void
}

export function AudioDecryptPanel({ container, onContainerChange }: AudioDecryptPanelProps) {
  const [passphrase, setPassphrase] = useState('')
  const { state, execute, reset } = useOperation(decryptAudio)

  const isRunning = state.phase === 'running'
  const canRun = container !== null && passphrase.length > 0

  const handleRun = useCallback(() => {
    if (!container) return
    void execute({ container, passphrase })
  }, [container, execute, passphrase])

  return (
    <OperationShell
      title="Decrypt audio"
      description="Reads the sample rate and block layout stored inside the encrypted WAV, rebuilds the masks from the passphrase, and restores the waveform."
      runLabel="Decrypt"
      canRun={canRun}
      blockedReason="Add the encrypted audio and the passphrase."
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'audio-decrypt',
        container?.name ?? 'cipher.wav', 'restored.wav',
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The restored audio appears here, ready to play."
          note={
            <p className="text-xs text-muted-foreground">
              A wrong passphrase decrypts to loud noise, so check the volume
              before pressing play.
            </p>
          }
        />
      }
    >
      <FileDropzone
        label="Encrypted audio"
        hint="the noisy cipher.wav"
        kind="audio"
        accept={ACCEPT_CIPHER_WAV}
        file={container}
        onFileChange={onContainerChange}
        disabled={isRunning}
      />
      <PassphraseField
        value={passphrase}
        onChange={setPassphrase}
        hint="Must be the passphrase used to encrypt."
        disabled={isRunning}
      />
    </OperationShell>
  )
}
