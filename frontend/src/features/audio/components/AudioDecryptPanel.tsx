import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { KeySelector } from '@/components/shared/KeySelector'
import { OperationShell } from '@/components/shared/OperationShell'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_CIPHER_WAV } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import { decryptAudio } from '@/services/audioService'
import type { KeyMode } from '@/services/types'

interface AudioDecryptPanelProps {
  container: File | null
  onContainerChange: (file: File | null) => void
}

export function AudioDecryptPanel({ container, onContainerChange }: AudioDecryptPanelProps) {
  const [keyMode, setKeyMode] = useState<KeyMode>('passphrase')
  const [passphrase, setPassphrase] = useState('')
  const [keyFile, setKeyFile] = useState<File | null>(null)
  const { state, execute, reset } = useOperation(decryptAudio)

  const isRunning = state.phase === 'running'
  const hasKey = keyMode === 'passphrase' ? passphrase.trim().length > 0 : keyFile !== null
  const canRun = container !== null && hasKey
  const blockedReason = !container
    ? 'Add the encrypted audio.'
    : keyMode === 'passphrase'
      ? 'Enter the passphrase.'
      : `Select the key ${keyMode} file.`

  const handleRun = useCallback(() => {
    if (!container) return
    void execute({ container, keyMode, passphrase, keyFile })
  }, [container, execute, keyFile, keyMode, passphrase])

  return (
    <OperationShell
      title="Decrypt audio"
      description="Reads the sample rate and block layout stored inside the encrypted WAV, rebuilds the masks from your key (passphrase, image, or audio), and restores the waveform."
      runLabel="Decrypt"
      canRun={canRun}
      blockedReason={blockedReason}
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'audio-decrypt',
        container?.name ?? 'cipher.wav', 'restored.wav',
        ...(keyMode === 'image' ? ['--key-image', keyFile?.name ?? 'key.png'] : []),
        ...(keyMode === 'audio' ? ['--key-audio', keyFile?.name ?? 'key.wav'] : []),
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The restored audio appears here, ready to play."
          note={
            <p className="text-xs text-muted-foreground">
              A wrong key decrypts to loud noise, so check the volume
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
      <KeySelector
        keyMode={keyMode}
        onKeyModeChange={setKeyMode}
        passphrase={passphrase}
        onPassphraseChange={setPassphrase}
        keyFile={keyFile}
        onKeyFileChange={setKeyFile}
        disabled={isRunning}
      />
    </OperationShell>
  )
}
