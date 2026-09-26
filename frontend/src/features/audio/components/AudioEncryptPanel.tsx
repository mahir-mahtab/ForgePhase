import { Lock } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_AUDIO } from '@/lib/accept'
import {
  AUDIO_DEFAULTS,
  BLOCK_SIZES,
  encryptAudio,
} from '@/services/audioService'
import type { TransformBackend } from '@/services/types'

const ICON = <Lock className="size-4" aria-hidden />

export function AudioEncryptPanel({ backend }: { backend: TransformBackend }) {
  const [file, setFile] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [blockSize, setBlockSize] = useState<number>(AUDIO_DEFAULTS.blockSize)
  const { state, execute, reset } = useOperation(encryptAudio)

  const isRunning = state.phase === 'running'
  const canRun = file !== null && passphrase.length > 0

  const handleRun = useCallback(() => {
    if (!file) return
    void execute({ input: file, passphrase, blockSize, backend })
  }, [backend, blockSize, execute, file, passphrase])

  const command = [
    'phaseforge --backend',
    backend,
    'audio-encrypt',
    file?.name ?? '<input.wav>',
    'cipher.npz --block-size',
    blockSize,
  ].join(' ')

  return (
    <OperationShell
      tone="audio"
      icon={ICON}
      title="Block-based DRPE"
      description="Splits the waveform into fixed blocks and runs double random phase encryption over each one. Every channel gets its own mask pair, derived from the passphrase."
      command="audio-encrypt"
      runLabel="Encrypt audio"
      canRun={canRun}
      blockedReason="Pick an audio file and enter a passphrase"
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      result={
        <ResultPanel
          state={state}
          tone="audio"
          idleHint="The ciphertext container appears here, with its block count and sample rate."
          cliCommand={command}
        />
      }
    >
      <FileDropzone
        label="Source audio"
        kind="audio"
        accept={ACCEPT_AUDIO}
        tone="audio"
        file={file}
        onFileChange={setFile}
        disabled={isRunning}
      />

      <PassphraseField
        value={passphrase}
        onChange={setPassphrase}
        disabled={isRunning}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="audio-block-size">Block size</Label>
        <Select
          value={String(blockSize)}
          disabled={isRunning}
          onValueChange={(next) => setBlockSize(Number(next))}
        >
          <SelectTrigger id="audio-block-size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BLOCK_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} samples
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Powers of two only, so no block needs padding. Larger blocks are
          fewer, cheaper transforms; smaller ones localise damage when part of a
          ciphertext is lost.
        </p>
      </div>
    </OperationShell>
  )
}
