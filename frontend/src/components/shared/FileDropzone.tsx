import { FileAudio, FileImage, Upload, X } from 'lucide-react'
import { memo, useCallback, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { formatBytes } from '@/lib/format'
import { type Sample, loadSample } from '@/lib/samples'
import { cn } from '@/lib/utils'

type DropzoneKind = 'image' | 'audio'

interface FileDropzoneProps {
  label: string
  hint?: string
  kind: DropzoneKind
  accept: string
  file: File | null
  onFileChange: (file: File | null) => void
  disabled?: boolean
  /** Offers a one-click demo file. */
  sample?: Sample
  /** Called after the sample loads, e.g. to fill in its passphrase. */
  onSampleLoaded?: (sample: Sample) => void
  /** Why the chosen file cannot be used, shown under it. */
  error?: string | null
}

/** Hoisted: constant JSX allocates once instead of on every render. */
const KIND_ICONS = {
  image: <FileImage className="size-5" aria-hidden />,
  audio: <FileAudio className="size-5" aria-hidden />,
} as const

function FileDropzoneImpl({
  label,
  hint,
  kind,
  accept,
  file,
  onFileChange,
  disabled = false,
  sample,
  onSampleLoaded,
  error,
}: FileDropzoneProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [sampleError, setSampleError] = useState<string | null>(null)

  const previewUrl = useObjectUrl(kind === 'image' ? file : null)
  const audioUrl = useObjectUrl(kind === 'audio' ? file : null)

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault()
      setIsDragging(false)
      if (disabled) return
      const dropped = event.dataTransfer.files.item(0)
      if (dropped) onFileChange(dropped)
    },
    [disabled, onFileChange],
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      // Without this the browser navigates to the dropped file.
      event.preventDefault()
      if (!disabled) setIsDragging(true)
    },
    [disabled],
  )

  const handleClear = useCallback(() => {
    onFileChange(null)
    // The input keeps its value, so re-picking the same file would be a no-op
    // without this reset.
    if (inputRef.current) inputRef.current.value = ''
  }, [onFileChange])

  const handleSample = useCallback(async () => {
    if (!sample) return
    setSampleError(null)
    try {
      onFileChange(await loadSample(sample))
      onSampleLoaded?.(sample)
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : 'Could not load the sample.')
    }
  }, [onFileChange, onSampleLoaded, sample])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="shrink-0 text-sm font-medium">
          {label}
        </label>
        {sample && !file ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void handleSample()}
            className="focus-ring rounded-sm text-xs text-primary hover:underline disabled:opacity-50"
          >
            Use sample
          </button>
        ) : hint ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>

      <label
        htmlFor={inputId}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        className={cn(
          'flex min-h-16 cursor-pointer items-center gap-3 rounded-md border border-dashed border-input px-3 py-2.5 transition-colors',
          !disabled && 'hover:border-primary/60 hover:bg-muted/60',
          isDragging && 'border-primary bg-accent-soft',
          disabled && 'cursor-not-allowed opacity-60',
          file && 'border-solid border-border bg-card',
          file && error && 'border-destructive',
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />

        {file ? (
          <>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                width={40}
                height={40}
                decoding="async"
                className="size-10 shrink-0 rounded-sm border border-border bg-plate object-cover"
              />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-accent-soft text-primary">
                {KIND_ICONS[kind]}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{file.name}</span>
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
              <X />
            </Button>
          </>
        ) : (
          <>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
              <Upload className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="text-foreground">Drop a file or </span>
              <span className="font-medium text-primary">browse</span>
              <span className="block truncate text-xs text-muted-foreground">{accept}</span>
            </span>
          </>
        )}
      </label>

      {audioUrl ? (
        <audio controls preload="metadata" src={audioUrl} className="h-9 w-full" />
      ) : null}
      {sampleError ? <p className="text-xs text-destructive">{sampleError}</p> : null}
      {file && error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

/**
 * Memoized: these sit inside forms that re-render on every keystroke, and a
 * dropzone holding a decoded image preview is the most expensive child there.
 */
export const FileDropzone = memo(FileDropzoneImpl)
