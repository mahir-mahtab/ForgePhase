import { ArrowRight } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { KeySelector } from '@/components/shared/KeySelector'
import { OperationShell } from '@/components/shared/OperationShell'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { Button } from '@/components/ui/button'
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
import { cliCommand } from '@/lib/cli'
import { SAMPLES } from '@/lib/samples'
import { AUDIO_DEFAULTS, BLOCK_SIZES, encryptAudio } from '@/services/audioService'
import type { KeyMode } from '@/services/types'

interface AudioEncryptPanelProps {
  onOpenInDecrypt: (container: File) => void
}

export function AudioEncryptPanel({ onOpenInDecrypt }: AudioEncryptPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const [keyMode, setKeyMode] = useState<KeyMode>('passphrase')
  const [passphrase, setPassphrase] = useState('')
  const [keyFile, setKeyFile] = useState<File | null>(null)
  const [blockSize, setBlockSize] = useState<number>(AUDIO_DEFAULTS.blockSize)
  const { state, execute, reset } = useOperation(encryptAudio)

  const isRunning = state.phase === 'running'
  const hasKey = keyMode === 'passphrase' ? passphrase.trim().length > 0 : keyFile !== null
  const canRun = file !== null && hasKey
  const blockedReason = !file
    ? 'Choose an audio file.'
    : keyMode === 'passphrase'
      ? 'Enter a passphrase.'
      : `Select a key ${keyMode} file.`

  const handleRun = useCallback(() => {
    if (!file) return
    void execute({ input: file, keyMode, passphrase, keyFile, blockSize })
  }, [blockSize, execute, file, keyFile, keyMode, passphrase])

  return (
    <OperationShell
      title="Encrypt audio"
      description="Cuts the waveform into fixed-size blocks and applies double random phase encoding to each, with a separate mask pair per block and channel."
      runLabel="Encrypt"
      canRun={canRun}
      blockedReason={blockedReason}
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand(
        'phaseforge', 'audio-encrypt',
        file?.name ?? 'input.wav', 'cipher.wav',
        '--block-size', blockSize,
        ...(keyMode === 'image' ? ['--key-image', keyFile?.name ?? 'key.png'] : []),
        ...(keyMode === 'audio' ? ['--key-audio', keyFile?.name ?? 'key.wav'] : []),
      )}
      result={
        <ResultPanel
          state={state}
          idleHint="The encrypted audio appears here as a single WAV that sounds like static."
          note={
            <p className="text-xs text-muted-foreground">
              Keep this WAV exactly as it is. It, plus the passphrase, is all you need to
              decrypt. It plays for twice as long as the original, and converting it to
              MP3 or editing it will destroy the recording. Turn the volume down before
              playing it.
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
        label="Audio"
        kind="audio"
        accept={ACCEPT_AUDIO}
        file={file}
        onFileChange={setFile}
        disabled={isRunning}
        sample={SAMPLES.speechClean}
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

      <div className="flex flex-col gap-1.5">
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
          Larger blocks mean fewer transforms; smaller ones limit how much is
          lost when part of the file is damaged.
        </p>
      </div>
    </OperationShell>
  )
}
