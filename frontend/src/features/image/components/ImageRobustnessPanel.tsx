import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { KeySelector } from '@/components/shared/KeySelector'
import { MetricsTable } from '@/components/shared/MetricsTable'
import { OperationShell } from '@/components/shared/OperationShell'
import { ReportState } from '@/components/shared/ReportState'
import { useKeyInput } from '@/hooks/useKeyInput'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_IMAGE, ACCEPT_PNG } from '@/lib/accept'
import { cliCommand, keyCliArgs } from '@/lib/cli'
import { imageRobustnessReport } from '@/services/imageService'

export function ImageRobustnessPanel() {
  const [cipherFile, setCipherFile] = useState<File | null>(null)
  const [original, setOriginal] = useState<File | null>(null)
  const key = useKeyInput()
  const { state, execute, reset } = useOperation(imageRobustnessReport)

  const isRunning = state.phase === 'running'
  const canRun = cipherFile !== null && original !== null && key.hasKey
  const blockedReason =
    cipherFile === null || original === null
      ? 'Choose the encrypted image and the original.'
      : key.missingReason

  const handleRun = useCallback(() => {
    if (!cipherFile || !original) return
    void execute({ cipherFile, original, ...key.options })
  }, [cipherFile, execute, key.options, original])

  return (
    <OperationShell
      title="Robustness report"
      description="Damages the encrypted image in several ways (noise, a missing block, coarse quantization), decrypts each copy with the correct key, and scores the result against the original."
      runLabel="Run report"
      canRun={canRun}
      blockedReason={blockedReason}
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'attack-report',
        cipherFile?.name ?? 'cipher.png', original?.name ?? 'original.png',
        ...keyCliArgs(key.options.keyMode, key.options.keyFile),
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
        hint="the image before encryption"
        kind="image"
        accept={ACCEPT_IMAGE}
        file={original}
        onFileChange={setOriginal}
        disabled={isRunning}
      />
      <KeySelector {...key.selectorProps} disabled={isRunning} />
    </OperationShell>
  )
}
