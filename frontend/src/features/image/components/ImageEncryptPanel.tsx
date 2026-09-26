import { ArrowRight } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { KeySelector } from '@/components/shared/KeySelector'
import { OperationShell } from '@/components/shared/OperationShell'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { SwitchField } from '@/components/shared/SwitchField'
import { Button } from '@/components/ui/button'
import { useKeyInput } from '@/hooks/useKeyInput'
import { useOperation } from '@/hooks/useOperation'
import { usePixelLimit } from '@/hooks/usePixelLimit'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { cliCommand, keyCliArgs } from '@/lib/cli'
import { PIXEL_LIMITS } from '@/lib/limits'
import { SAMPLES } from '@/lib/samples'
import { encryptImage } from '@/services/imageService'

interface ImageEncryptPanelProps {
  onOpenInDecrypt: (cipher: File) => void
}

export function ImageEncryptPanel({ onOpenInDecrypt }: ImageEncryptPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const key = useKeyInput()
  const [greyscale, setGreyscale] = useState(false)
  const { state, execute, reset } = useOperation(encryptImage)

  const isRunning = state.phase === 'running'
  const sizeError = usePixelLimit(file, PIXEL_LIMITS.encrypt)
  const canRun = file !== null && sizeError === null && key.hasKey
  const blockedReason =
    file === null ? 'Choose an image.' : sizeError ? 'Choose a smaller image.' : key.missingReason

  const handleRun = useCallback(() => {
    if (!file) return
    void execute({ input: file, ...key.options, greyscale })
  }, [execute, file, greyscale, key.options])

  return (
    <OperationShell
      title="Encrypt an image"
      description="Encrypts the image using masks derived from your key."
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
        ...keyCliArgs(key.options.keyMode, key.options.keyFile),
        greyscale && '--greyscale',
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The encrypted image appears here as a single noisy picture."
          note={
            <p className="text-xs text-muted-foreground">
              Keep this PNG unedited. Re-saving or resizing destroys it.
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
        sample={SAMPLES.imageEncrypt}
        error={sizeError}
      />

      <KeySelector {...key.selectorProps} disabled={isRunning} />

      <SwitchField
        label="Convert to greyscale"
        description="Grayscale: faster, smaller output."
        checked={greyscale}
        onCheckedChange={setGreyscale}
        disabled={isRunning}
      />
    </OperationShell>
  )
}
