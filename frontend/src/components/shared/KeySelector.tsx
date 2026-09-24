import { memo } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { Label } from '@/components/ui/label'
import { ACCEPT_AUDIO, ACCEPT_IMAGE } from '@/lib/accept'
import type { KeyMode } from '@/services/types'

const KEY_OPTIONS = [
  { value: 'passphrase', label: 'Passphrase' },
  { value: 'image', label: 'Image Key' },
  { value: 'audio', label: 'Audio Key' },
] as const

interface KeySelectorProps {
  keyMode: KeyMode
  onKeyModeChange: (mode: KeyMode) => void
  passphrase: string
  onPassphraseChange: (value: string) => void
  keyFile: File | null
  onKeyFileChange: (file: File | null) => void
  disabled?: boolean
  label?: string
}

function KeySelectorImpl({
  keyMode,
  onKeyModeChange,
  passphrase,
  onPassphraseChange,
  keyFile,
  onKeyFileChange,
  disabled = false,
  label = 'Key source',
}: KeySelectorProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <SegmentedControl
          label={label}
          value={keyMode}
          options={KEY_OPTIONS}
          onChange={onKeyModeChange}
          disabled={disabled}
        />
      </div>

      {keyMode === 'passphrase' && (
        <PassphraseField
          value={passphrase}
          onChange={onPassphraseChange}
          disabled={disabled}
        />
      )}

      {keyMode === 'image' && (
        <FileDropzone
          label="Key image"
          hint="Lossless image (e.g. PNG, TIFF, BMP) whose pixel array derives the phase masks."
          kind="image"
          accept={ACCEPT_IMAGE}
          file={keyFile}
          onFileChange={onKeyFileChange}
          disabled={disabled}
        />
      )}

      {keyMode === 'audio' && (
        <FileDropzone
          label="Key audio"
          hint="Lossless audio (e.g. WAV, FLAC) whose waveform array derives the phase masks."
          kind="audio"
          accept={ACCEPT_AUDIO}
          file={keyFile}
          onFileChange={onKeyFileChange}
          disabled={disabled}
        />
      )}
    </div>
  )
}

export const KeySelector = memo(KeySelectorImpl)
