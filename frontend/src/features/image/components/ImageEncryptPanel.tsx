import { Lock } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { encryptImage } from '@/services/imageService'
import type { TransformBackend } from '@/services/types'

const ICON = <Lock className="size-4" aria-hidden />

export function ImageEncryptPanel({ backend }: { backend: TransformBackend }) {
  const [file, setFile] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [greyscale, setGreyscale] = useState(false)
  const { state, execute, reset } = useOperation(encryptImage)

  // Derived during render: storing this in state would only let it drift.
  const canRun = file !== null && passphrase.length > 0

  const handleRun = useCallback(() => {
    if (!file) return
    void execute({ input: file, passphrase, greyscale, backend })
  }, [backend, execute, file, greyscale, passphrase])

  const command = `phaseforge --backend ${backend} image-encrypt ${
    file?.name ?? '<input>'
  } cipher.npz${greyscale ? ' --greyscale' : ''}`

  return (
    <OperationShell
      tone="image"
      icon={ICON}
      title="Double random phase encryption"
      description="Two passphrase-derived random-phase masks, one in the spatial domain and one in the frequency domain. The output is a complex ciphertext container."
      command="image-encrypt"
      runLabel="Encrypt image"
      canRun={canRun}
      blockedReason="Pick an image and enter a passphrase"
      isRunning={state.phase === 'running'}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      result={
        <ResultPanel
          state={state}
          tone="image"
          idleHint="The ciphertext container and a preview of its magnitude spectrum will appear here."
          cliCommand={command}
        />
      }
    >
      <FileDropzone
        label="Source image"
        kind="image"
        accept={ACCEPT_IMAGE}
        tone="image"
        file={file}
        onFileChange={setFile}
        disabled={state.phase === 'running'}
      />

      <PassphraseField
        value={passphrase}
        onChange={setPassphrase}
        disabled={state.phase === 'running'}
      />

      <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3.5">
        <div className="min-w-0">
          <Label htmlFor="image-encrypt-greyscale">Collapse to greyscale</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            One channel instead of three. Roughly a third of the work, and the
            container is a third of the size.
          </p>
        </div>
        <Switch
          id="image-encrypt-greyscale"
          checked={greyscale}
          onCheckedChange={setGreyscale}
          disabled={state.phase === 'running'}
        />
      </div>
    </OperationShell>
  )
}
