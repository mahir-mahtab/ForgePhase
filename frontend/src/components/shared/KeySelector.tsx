import { memo, useCallback } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { Label } from '@/components/ui/label'
import { ACCEPT_KEY_AUDIO, ACCEPT_KEY_IMAGE } from '@/lib/accept'
import type { KeyMode } from '@/services/types'

const KEY_OPTIONS = [
  { value: 'passphrase', label: 'Passphrase' },
  { value: 'image', label: 'Image file' },
  { value: 'audio', label: 'Audio file' },
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
  label = 'Key',
}: KeySelectorProps) {
  // Image and audio modes share one file slot, so a file picked in one mode
  // must not carry over and be sent as the other kind of key.
  const handleModeChange = useCallback(
    (mode: KeyMode) => {
      if (mode !== keyMode) onKeyFileChange(null)
      onKeyModeChange(mode)
    },
    [keyMode, onKeyFileChange, onKeyModeChange],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>{label}</Label>
        <SegmentedControl
          label={label}
          value={keyMode}
          options={KEY_OPTIONS}
          onChange={handleModeChange}
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
          hint="its pixels are the key; PNG is safest"
          kind="image"
          accept={ACCEPT_KEY_IMAGE}
          file={keyFile}
          onFileChange={onKeyFileChange}
          disabled={disabled}
        />
      )}

      {keyMode === 'audio' && (
        <FileDropzone
          label="Key audio"
          hint="its samples are the key; lossless only"
          kind="audio"
          accept={ACCEPT_KEY_AUDIO}
          file={keyFile}
          onFileChange={onKeyFileChange}
          disabled={disabled}
        />
      )}
    </div>
  )
}

export const KeySelector = memo(KeySelectorImpl)
