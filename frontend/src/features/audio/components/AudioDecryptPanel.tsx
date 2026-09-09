import { Unlock } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_CONTAINER } from '@/lib/accept'
import { decryptAudio } from '@/services/audioService'
import type { TransformBackend } from '@/services/types'

const ICON = <Unlock className="size-4" aria-hidden />

export function AudioDecryptPanel({ backend }: { backend: TransformBackend }) {
  const [container, setContainer] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const { state, execute, reset } = useOperation(decryptAudio)

  const isRunning = state.phase === 'running'
  const canRun = container !== null && passphrase.length > 0

  const handleRun = useCallback(() => {
    if (!container) return
    void execute({ container, passphrase, backend })
  }, [backend, container, execute, passphrase])

  const command = [
    'phaseforge --backend',
    backend,
    'audio-decrypt',
    container?.name ?? '<cipher.npz>',
    'restored.wav',
  ].join(' ')

  return (
    <OperationShell
      tone="audio"
      icon={ICON}
      title="Decrypt a container"
      description="Reads the sample rate and block layout from the container's own metadata, rebuilds the masks, and inverts each block."
      command="audio-decrypt"
      runLabel="Decrypt audio"
      canRun={canRun}
      blockedReason="Pick a .npz container and enter its passphrase"
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      result={
        <ResultPanel
          state={state}
          tone="audio"
          idleHint="The recovered waveform appears here, ready to play back."
          cliCommand={command}
        />
      }
    >
      <FileDropzone
        label="Ciphertext container"
        hint=".npz"
        kind="container"
        accept={ACCEPT_CONTAINER}
        tone="audio"
        file={container}
        onFileChange={setContainer}
        disabled={isRunning}
      />

      <PassphraseField
        value={passphrase}
        onChange={setPassphrase}
        hint="A wrong passphrase produces noise at full level. Turn the volume down first."
        disabled={isRunning}
      />
    </OperationShell>
  )
}
