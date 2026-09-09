import { Download } from 'lucide-react'
import { memo } from 'react'

import {
  ErrorState,
  IdleState,
  NotImplementedState,
  RunningState,
} from '@/components/shared/StateFallback'
import { Button } from '@/components/ui/button'
import type { OperationState } from '@/hooks/useOperation'
import { formatBytes } from '@/lib/format'
import type { ArtifactResult } from '@/services/types'

interface ResultPanelProps {
  state: OperationState<ArtifactResult>
  tone: 'image' | 'audio'
  /** Shown before the first run, so the panel explains itself. */
  idleHint: string
  /** The equivalent CLI invocation, shown while the backend is unwired. */
  cliCommand: string
}

function ResultPanelImpl({
  state,
  tone,
  idleHint,
  cliCommand,
}: ResultPanelProps) {
  // Early returns keep each branch flat and let the success path below assume
  // a resolved artifact without any further narrowing.
  if (state.phase === 'idle') return <IdleState hint={idleHint} tone={tone} />
  if (state.phase === 'running') return <RunningState />
  if (state.phase === 'not-implemented') {
    return (
      <NotImplementedState message={state.message} cliCommand={cliCommand} />
    )
  }
  if (state.phase === 'error') return <ErrorState message={state.message} />

  const { artifact, details } = state.data

  return (
    <div className="flex min-h-64 flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{artifact.name}</p>
          <p className="tabular font-mono text-xs text-muted-foreground">
            {artifact.byteLength === null
              ? artifact.mimeType
              : `${formatBytes(artifact.byteLength)} ${artifact.mimeType}`}
          </p>
        </div>

        {artifact.url === null ? null : (
          <Button asChild size="sm" variant="outline">
            <a href={artifact.url} download={artifact.name}>
              <Download className="size-4" />
              Download
            </a>
          </Button>
        )}
      </div>

      {artifact.url !== null && artifact.mimeType.startsWith('image/') ? (
        <img
          src={artifact.url}
          alt={artifact.name}
          loading="lazy"
          decoding="async"
          className="max-h-72 w-full border border-plate-edge bg-plate object-contain"
        />
      ) : null}

      {artifact.url !== null && artifact.mimeType.startsWith('audio/') ? (
        <audio
          controls
          preload="metadata"
          src={artifact.url}
          className="w-full"
        />
      ) : null}

      {details.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3">
          {details.map((detail) => (
            <div key={detail.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{detail.label}</dt>
              <dd className="tabular truncate font-mono text-sm">
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

export const ResultPanel = memo(ResultPanelImpl)
