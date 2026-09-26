import { useCallback } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { KeySelector } from '@/components/shared/KeySelector'
import { OperationShell } from '@/components/shared/OperationShell'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useKeyInput } from '@/hooks/useKeyInput'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_PNG } from '@/lib/accept'
import { cliCommand, keyCliArgs } from '@/lib/cli'
import { SAMPLES } from '@/lib/samples'
import { decryptImage } from '@/services/imageService'

interface ImageDecryptPanelProps {
  cipherFile: File | null
  onCipherChange: (file: File | null) => void
}

export function ImageDecryptPanel({
  cipherFile,
  onCipherChange,
}: ImageDecryptPanelProps) {
  const key = useKeyInput()
  const { state, execute, reset } = useOperation(decryptImage)

  const isRunning = state.phase === 'running'
  const canRun = cipherFile !== null && key.hasKey
  const blockedReason = cipherFile === null ? 'Choose the encrypted image.' : key.missingReason

  const handleRun = useCallback(() => {
    if (!cipherFile) return
    void execute({ cipherFile, ...key.options })
  }, [cipherFile, execute, key.options])

  return (
    <OperationShell
      title="Decrypt an image"
      description="Restores the image from your key. A wrong key gives noise."
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
        ...keyCliArgs(key.options.keyMode, key.options.keyFile),
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The restored image appears here."
          note={
            <p className="text-xs text-muted-foreground">
              Looks like noise? The key is wrong.
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
        sample={SAMPLES.imageDecrypt}
        onSampleLoaded={key.applySampleKey}
      />
      <KeySelector {...key.selectorProps} disabled={isRunning} />
    </OperationShell>
  )
}
