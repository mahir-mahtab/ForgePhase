import { Download } from 'lucide-react'
import type { ReactNode } from 'react'
import { memo } from 'react'

import { Button } from '@/components/ui/button'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Artifact, Detail } from '@/services/types'

/** A downloadable file with an inline image or audio preview. */
function ArtifactViewImpl({
  artifact,
  title,
  compact = false,
}: {
  artifact: Artifact
  /** Shown instead of the file name. */
  title?: string
  compact?: boolean
}) {
  const url = useObjectUrl(artifact.file)
  const isImage = artifact.mimeType.startsWith('image/')
  const isAudio = artifact.mimeType.startsWith('audio/')

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title ?? artifact.name}</p>
          <p className="tabular truncate text-xs text-muted-foreground">
            {title ? `${artifact.name} · ` : null}
            {formatBytes(artifact.byteLength)}
          </p>
        </div>
        {url ? (
          <Button asChild size="sm" variant="outline">
            <a href={url} download={artifact.name}>
              <Download />
              Download
            </a>
          </Button>
        ) : null}
      </div>

      {url && isImage ? (
        <img
          src={url}
          alt={title ?? artifact.name}
          decoding="async"
          className={cn(
            'w-full rounded-md border border-border bg-plate object-contain [image-rendering:pixelated]',
            compact ? 'h-40' : 'max-h-80',
          )}
        />
      ) : null}
      {url && isAudio ? (
        <audio controls preload="metadata" src={url} className="h-9 w-full" />
      ) : null}
    </div>
  )
}

export const ArtifactView = memo(ArtifactViewImpl)

export function DetailList({ details }: { details: Detail[] }) {
  if (details.length === 0) return null
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 sm:grid-cols-3">
      {details.map((detail) => (
        <div key={detail.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{detail.label}</dt>
          <dd className="truncate text-sm" title={detail.value}>
            {detail.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Wraps a successful result: optional heading, content, then actions. */
export function ResultCard({
  children,
  actions,
}: {
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      {children}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
