import { useCallback } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { KeySelector } from '@/components/shared/KeySelector'
import { OperationShell } from '@/components/shared/OperationShell'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { useKeyInput } from '@/hooks/useKeyInput'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_CIPHER_WAV } from '@/lib/accept'
import { cliCommand, keyCliArgs } from '@/lib/cli'
import { SAMPLES } from '@/lib/samples'
import { decryptAudio } from '@/services/audioService'

interface AudioDecryptPanelProps {
  container: File | null
  onContainerChange: (file: File | null) => void
}

export function AudioDecryptPanel({ container, onContainerChange }: AudioDecryptPanelProps) {
  const key = useKeyInput()
  const { state, execute, reset } = useOperation(decryptAudio)

  const isRunning = state.phase === 'running'
  const canRun = container !== null && key.hasKey
  const blockedReason = container === null ? 'Choose the encrypted audio.' : key.missingReason

  const handleRun = useCallback(() => {
    if (!container) return
    void execute({ container, ...key.options })
  }, [container, execute, key.options])

  return (
    <OperationShell
      title="Decrypt audio"
      description="Reads the sample rate and block layout stored inside the encrypted WAV, rebuilds the masks from your key, and restores the waveform. There is no checksum: a wrong key gives noise, not an error."
      runLabel="Decrypt"
      canRun={canRun}
      blockedReason={blockedReason}
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'audio-decrypt',
        container?.name ?? 'cipher.wav', 'restored.wav',
        ...keyCliArgs(key.options.keyMode, key.options.keyFile),
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The restored audio appears here, ready to play."
          note={
            <p className="text-xs text-muted-foreground">
              Loud static? The key is wrong.
            </p>
          }
        />
      }
    >
      <FileDropzone
        label="Encrypted audio"
        hint="the noisy cipher.wav"
        kind="audio"
        accept={ACCEPT_CIPHER_WAV}
        file={container}
        onFileChange={onContainerChange}
        disabled={isRunning}
        sample={SAMPLES.audioDecrypt}
        onSampleLoaded={key.applySampleKey}
      />
      <KeySelector {...key.selectorProps} disabled={isRunning} />
    </OperationShell>
  )
}
