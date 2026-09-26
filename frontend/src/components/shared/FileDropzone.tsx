import { FileAudio, FileImage, FileLock2, UploadCloud, X } from 'lucide-react'
import { memo, useCallback, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'

export type DropzoneKind = 'image' | 'audio' | 'container'

interface FileDropzoneProps {
  id?: string
  label: string
  hint?: string
  kind: DropzoneKind
  accept: string
  tone: 'image' | 'audio'
  file: File | null
  onFileChange: (file: File | null) => void
  disabled?: boolean
}

/** Hoisted: constant JSX allocates once instead of on every render. */
const KIND_ICONS = {
  image: <FileImage className="size-5" aria-hidden />,
  audio: <FileAudio className="size-5" aria-hidden />,
  container: <FileLock2 className="size-5" aria-hidden />,
} as const

const TONE_CLASSES = {
  image: {
    active: 'border-image bg-image-wash',
    icon: 'text-image',
    chip: 'bg-image-wash text-image',
  },
  audio: {
    active: 'border-audio bg-audio-wash',
    icon: 'text-audio',
    chip: 'bg-audio-wash text-audio',
  },
} as const

function FileDropzoneImpl({
  id,
  label,
  hint,
  kind,
  accept,
  tone,
  file,
  onFileChange,
  disabled = false,
}: FileDropzoneProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const previewUrl = useObjectUrl(kind === 'image' ? file : null)
  const audioUrl = useObjectUrl(kind === 'audio' ? file : null)
  const toneClasses = TONE_CLASSES[tone]

  const handleSelect = useCallback(
    (next: File | null) => {
      onFileChange(next)
    },
    [onFileChange],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault()
      setIsDragging(false)
      if (disabled) return

      const dropped = event.dataTransfer.files.item(0)
      if (dropped) handleSelect(dropped)
    },
    [disabled, handleSelect],
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      // Without this the browser navigates to the dropped file.
      event.preventDefault()
      if (!disabled) setIsDragging(true)
    },
    [disabled],
  )

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleClear = useCallback(() => {
    handleSelect(null)
    // The input keeps its value, so re-picking the same file would be a no-op
    // without this reset.
    if (inputRef.current) inputRef.current.value = ''
  }, [handleSelect])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-foreground"
        >
          {label}
        </label>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>

      <label
        htmlFor={inputId}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'group relative flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input bg-muted/40 px-4 py-5 text-center transition-colors',
          !disabled && 'hover:border-ring hover:bg-muted',
          isDragging ? toneClasses.active : null,
          disabled ? 'cursor-not-allowed opacity-60' : null,
          file ? 'border-solid bg-card' : null,
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => handleSelect(event.target.files?.[0] ?? null)}
        />

        {file ? (
          <div className="flex w-full items-center gap-3 text-left">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                width={48}
                height={48}
                loading="lazy"
                decoding="async"
                className="size-12 shrink-0 rounded-md border border-border object-cover"
              />
            ) : (
              <span
                className={cn(
                  'flex size-12 shrink-0 items-center justify-center rounded-md',
                  toneClasses.chip,
                )}
              >
                {KIND_ICONS[kind]}
              </span>
            )}

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {file.name}
              </span>
              <span className="tabular block text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </span>
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${file.name}`}
              disabled={disabled}
              onClick={(event) => {
                // The wrapper is a label; without this the file picker reopens.
                event.preventDefault()
                handleClear()
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <>
            <UploadCloud
              className={cn('size-6', toneClasses.icon)}
              aria-hidden
            />
            <span className="text-sm text-foreground">
              Drop a file or{' '}
              <span className="font-medium underline underline-offset-2">
                browse
              </span>
            </span>
            <span className="text-xs text-muted-foreground">{accept}</span>
          </>
        )}
      </label>

      {audioUrl ? (
        <audio
          controls
          preload="metadata"
          src={audioUrl}
          className="h-9 w-full"
        />
      ) : null}
    </div>
  )
}

/**
 * Memoized: these sit inside forms that re-render on every keystroke, and a
 * dropzone holding a decoded image preview is the most expensive child there.
 */
export const FileDropzone = memo(FileDropzoneImpl)
