import { Unlock } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_CONTAINER } from '@/lib/accept'
import { decryptImage } from '@/services/imageService'
import type { TransformBackend } from '@/services/types'

const ICON = <Unlock className="size-4" aria-hidden />

export function ImageDecryptPanel({ backend }: { backend: TransformBackend }) {
  const [container, setContainer] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const { state, execute, reset } = useOperation(decryptImage)

  const canRun = container !== null && passphrase.length > 0

  const handleRun = useCallback(() => {
    if (!container) return
    void execute({ container, passphrase, backend })
  }, [backend, container, execute, passphrase])

  const command = `phaseforge --backend ${backend} image-decrypt ${
    container?.name ?? '<cipher.npz>'
  } restored.png`

  return (
    <OperationShell
      tone="image"
      icon={ICON}
      title="Decrypt a container"
      description="Rebuilds both masks from the passphrase and inverts the transform. A wrong passphrase decrypts to noise rather than failing."
      command="image-decrypt"
      runLabel="Decrypt image"
      canRun={canRun}
      blockedReason="Pick a .npz container and enter its passphrase"
      isRunning={state.phase === 'running'}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      result={
        <ResultPanel
          state={state}
          tone="image"
          idleHint="The recovered image appears here, alongside the container's stored shape and mode."
          cliCommand={command}
        />
      }
    >
      <FileDropzone
        label="Ciphertext container"
        hint=".npz"
        kind="container"
        accept={ACCEPT_CONTAINER}
        tone="image"
        file={container}
        onFileChange={setContainer}
        disabled={state.phase === 'running'}
      />

      <PassphraseField
        value={passphrase}
        onChange={setPassphrase}
        hint="Must match the passphrase used to encrypt. There is no checksum to warn you."
        disabled={state.phase === 'running'}
      />
    </OperationShell>
  )
}
