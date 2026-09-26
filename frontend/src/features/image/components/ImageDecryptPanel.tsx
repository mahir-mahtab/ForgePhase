import { Unlock } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { decryptImage } from '@/services/imageService'
import type { TransformBackend } from '@/services/types'

const ICON = <Unlock className="size-4" aria-hidden />

export function ImageDecryptPanel({ backend }: { backend: TransformBackend }) {
  const [realFile, setRealFile] = useState<File | null>(null)
  const [imaginaryFile, setImaginaryFile] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const { state, execute, reset } = useOperation(decryptImage)

  const canRun = realFile !== null && imaginaryFile !== null && passphrase.length > 0

  const handleRun = useCallback(() => {
    if (!realFile || !imaginaryFile) return
    void execute({ realFile, imaginaryFile, passphrase, backend })
  }, [backend, execute, imaginaryFile, passphrase, realFile])

  const command = `phaseforge --backend ${backend} image-decrypt ${
    realFile?.name ?? '<cipher-real.png>'
  } ${imaginaryFile?.name ?? '<cipher-imaginary.png>'} restored.png`

  return (
    <OperationShell
      tone="image"
      icon={ICON}
      title="Decrypt a cipher pair"
      description="Rebuilds both masks from the passphrase, combines the real and imaginary components, and inverts the transform. A wrong passphrase decrypts to noise rather than failing."
      command="image-decrypt"
      runLabel="Decrypt image"
      canRun={canRun}
      blockedReason="Pick both cipher PNGs and enter their passphrase"
      isRunning={state.phase === 'running'}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      result={
        <ResultPanel
          state={state}
          tone="image"
          idleHint="The recovered image appears here after both cipher components are validated."
          cliCommand={command}
        />
      }
    >
      <FileDropzone
        label="Real cipher component"
        hint="cipher-real.png"
        kind="image"
        accept={ACCEPT_IMAGE}
        tone="image"
        file={realFile}
        onFileChange={setRealFile}
        disabled={state.phase === 'running'}
      />

      <FileDropzone
        label="Imaginary cipher component"
        hint="cipher-imaginary.png"
        kind="image"
        accept={ACCEPT_IMAGE}
        tone="image"
        file={imaginaryFile}
        onFileChange={setImaginaryFile}
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
