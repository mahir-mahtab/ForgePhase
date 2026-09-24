import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_PNG } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import { decryptImage } from '@/services/imageService'

interface ImageDecryptPanelProps {
  cipherFile: File | null
  onCipherChange: (file: File | null) => void
}

export function ImageDecryptPanel({
  cipherFile,
  onCipherChange,
}: ImageDecryptPanelProps) {
  const [passphrase, setPassphrase] = useState('')
  const { state, execute, reset } = useOperation(decryptImage)

  const isRunning = state.phase === 'running'
  const canRun = cipherFile !== null && passphrase.length > 0

  const handleRun = useCallback(() => {
    if (!cipherFile) return
    void execute({ cipherFile, passphrase })
  }, [cipherFile, execute, passphrase])

  return (
    <OperationShell
      title="Decrypt an image"
      description="Rebuilds both masks from the passphrase and reverses the transform. There is no checksum: a wrong passphrase gives noise, not an error."
      runLabel="Decrypt"
      canRun={canRun}
      blockedReason="Add the encrypted image and the passphrase."
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'image-decrypt',
        cipherFile?.name ?? 'cipher.png', 'restored.png',
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The restored image appears here."
          note={
            <p className="text-xs text-muted-foreground">
              Looks like noise? The passphrase is probably wrong.
            </p>
          }
        />
      }
    >
      <FileDropzone
        label="Encrypted image"
        hint="the noisy cipher.png"
        kind="image"
        accept={ACCEPT_PNG}
        file={cipherFile}
        onFileChange={onCipherChange}
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
