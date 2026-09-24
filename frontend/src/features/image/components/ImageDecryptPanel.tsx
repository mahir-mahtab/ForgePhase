import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { KeySelector } from '@/components/shared/KeySelector'
import { OperationShell } from '@/components/shared/OperationShell'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_PNG } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import { decryptImage } from '@/services/imageService'
import type { KeyMode } from '@/services/types'

interface ImageDecryptPanelProps {
  cipherFile: File | null
  onCipherChange: (file: File | null) => void
}

export function ImageDecryptPanel({
  cipherFile,
  onCipherChange,
}: ImageDecryptPanelProps) {
  const [keyMode, setKeyMode] = useState<KeyMode>('passphrase')
  const [passphrase, setPassphrase] = useState('')
  const [keyFile, setKeyFile] = useState<File | null>(null)
  const { state, execute, reset } = useOperation(decryptImage)

  const isRunning = state.phase === 'running'
  const hasKey = keyMode === 'passphrase' ? passphrase.trim().length > 0 : keyFile !== null
  const canRun = cipherFile !== null && hasKey
  const blockedReason = !cipherFile
    ? 'Add the encrypted image.'
    : keyMode === 'passphrase'
      ? 'Enter the passphrase.'
      : `Select the key ${keyMode} file.`

  const handleRun = useCallback(() => {
    if (!cipherFile) return
    void execute({ cipherFile, keyMode, passphrase, keyFile })
  }, [cipherFile, execute, keyFile, keyMode, passphrase])

  return (
    <OperationShell
      title="Decrypt an image"
      description="Rebuilds both masks from your key (passphrase, image, or audio) and reverses the transform. There is no checksum: a wrong key gives noise, not an error."
      runLabel="Decrypt"
      canRun={canRun}
      blockedReason={blockedReason}
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'image-decrypt',
        cipherFile?.name ?? 'cipher.png', 'restored.png',
        ...(keyMode === 'image' ? ['--key-image', keyFile?.name ?? 'key.png'] : []),
        ...(keyMode === 'audio' ? ['--key-audio', keyFile?.name ?? 'key.wav'] : []),
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The restored image appears here."
          note={
            <p className="text-xs text-muted-foreground">
              Looks like noise? The key is probably wrong.
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
