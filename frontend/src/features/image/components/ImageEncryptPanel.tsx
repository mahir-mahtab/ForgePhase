import { ArrowRight } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { KeySelector } from '@/components/shared/KeySelector'
import { OperationShell } from '@/components/shared/OperationShell'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import { SAMPLES } from '@/lib/samples'
import { encryptImage } from '@/services/imageService'
import type { KeyMode } from '@/services/types'

interface ImageEncryptPanelProps {
  onOpenInDecrypt: (cipher: File) => void
}

export function ImageEncryptPanel({ onOpenInDecrypt }: ImageEncryptPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const [keyMode, setKeyMode] = useState<KeyMode>('passphrase')
  const [passphrase, setPassphrase] = useState('')
  const [keyFile, setKeyFile] = useState<File | null>(null)
  const [greyscale, setGreyscale] = useState(false)
  const { state, execute, reset } = useOperation(encryptImage)

  const isRunning = state.phase === 'running'
  const hasKey = keyMode === 'passphrase' ? passphrase.trim().length > 0 : keyFile !== null
  const canRun = file !== null && hasKey
  const blockedReason = !file
    ? 'Choose an image.'
    : keyMode === 'passphrase'
      ? 'Enter a passphrase.'
      : `Select a key ${keyMode} file.`

  const handleRun = useCallback(() => {
    if (!file) return
    void execute({ input: file, keyMode, passphrase, keyFile, greyscale })
  }, [execute, file, greyscale, keyFile, keyMode, passphrase])

  return (
    <OperationShell
      title="Encrypt an image"
      description="Multiplies the image by a random phase mask, transforms it, and multiplies by a second mask in the frequency domain. Both masks are derived from your key (passphrase, image, or audio)."
      runLabel="Encrypt"
      canRun={canRun}
      blockedReason={blockedReason}
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'image-encrypt',
        file?.name ?? 'input.png', 'cipher.png',
        ...(keyMode === 'image' ? ['--key-image', keyFile?.name ?? 'key.png'] : []),
        ...(keyMode === 'audio' ? ['--key-audio', keyFile?.name ?? 'key.wav'] : []),
        greyscale && '--greyscale',
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The encrypted image appears here as a single noisy picture."
          note={
            <p className="text-xs text-muted-foreground">
              Keep this PNG exactly as it is. It, plus the passphrase, is all you need to
              decrypt. Re-saving it as JPEG or resizing it will destroy the image.
            </p>
          }
          actions={(result) => (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenInDecrypt(result.artifact.file)}
            >
              Open in Decrypt
              <ArrowRight />
            </Button>
          )}
        />
      }
    >
      <FileDropzone
        label="Image"
        kind="image"
        accept={ACCEPT_IMAGE}
        file={file}
        onFileChange={setFile}
        disabled={isRunning}
        sample={SAMPLES.image}
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

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor="image-encrypt-greyscale">Convert to greyscale</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            One channel instead of three: faster, with smaller output.
          </p>
        </div>
        <Switch
          id="image-encrypt-greyscale"
          checked={greyscale}
          onCheckedChange={setGreyscale}
          disabled={isRunning}
        />
      </div>
    </OperationShell>
  )
}
