import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { MetricsTable } from '@/components/shared/MetricsTable'
import { OperationShell } from '@/components/shared/OperationShell'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { ReportState } from '@/components/shared/ReportState'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_IMAGE, ACCEPT_PNG } from '@/lib/accept'
import { cliCommand } from '@/lib/cli'
import { imageRobustnessReport } from '@/services/imageService'
import type { TransformBackend } from '@/services/types'

export function ImageRobustnessPanel({ backend }: { backend: TransformBackend }) {
  const [cipherFile, setCipherFile] = useState<File | null>(null)
  const [original, setOriginal] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const { state, execute, reset } = useOperation(imageRobustnessReport)

  const isRunning = state.phase === 'running'
  const canRun = cipherFile !== null && original !== null && passphrase.length > 0

  const handleRun = useCallback(() => {
    if (!cipherFile || !original) return
    void execute({ cipherFile, original, passphrase, backend })
  }, [backend, cipherFile, execute, original, passphrase])

  return (
    <OperationShell
      title="Robustness report"
      description="Damages the ciphertext in several ways (noise, a missing block, coarse quantization), decrypts each copy with the correct passphrase, and scores the result against the original."
      runLabel="Run report"
      canRun={canRun}
      blockedReason="Add the encrypted image, the original image and the passphrase."
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', '--backend', backend, 'attack-report',
        cipherFile?.name ?? 'cipher.png', original?.name ?? 'original.png',
      )}
      result={
        <ReportState
          state={state}
          idleHint="A table of how much of the image survives each kind of damage."
          render={(report) => <MetricsTable report={report} />}
        />
      }
    >
      <FileDropzone
        label="Encrypted image"
        hint="the noisy cipher.png"
        kind="image"
        accept={ACCEPT_PNG}
        file={cipherFile}
        onFileChange={setCipherFile}
        disabled={isRunning}
      />
      <FileDropzone
        label="Original image"
        hint="the unencrypted file"
        kind="image"
        accept={ACCEPT_IMAGE}
        file={original}
        onFileChange={setOriginal}
        disabled={isRunning}
      />
      <PassphraseField
        value={passphrase}
        onChange={setPassphrase}
        hint="The passphrase used to encrypt."
        disabled={isRunning}
      />
    </OperationShell>
  )
}
