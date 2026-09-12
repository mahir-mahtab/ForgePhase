import { Download } from 'lucide-react'
import { memo, useEffect } from 'react'

import {
  ErrorState,
  IdleState,
  NotImplementedState,
  RunningState,
} from '@/components/shared/StateFallback'
import { Button } from '@/components/ui/button'
import type { OperationState } from '@/hooks/useOperation'
import { formatBytes } from '@/lib/format'
import type { CipherPairResult } from '@/services/types'

interface CipherPairResultPanelProps {
  state: OperationState<CipherPairResult>
  idleHint: string
  cliCommand: string
}

function CipherPairResultPanelImpl({
  state,
  idleHint,
  cliCommand,
}: CipherPairResultPanelProps) {
  const realUrl = state.phase === 'ok' ? state.data.real.url : null
  const imaginaryUrl = state.phase === 'ok' ? state.data.imaginary.url : null
  const bundleUrl = state.phase === 'ok' ? state.data.bundle.url : null

  useEffect(
    () => () => {
      [realUrl, imaginaryUrl, bundleUrl].forEach((url) => {
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
      })
    },
    [bundleUrl, imaginaryUrl, realUrl],
  )

  if (state.phase === 'idle') return <IdleState hint={idleHint} tone="image" />
  if (state.phase === 'running') return <RunningState />
  if (state.phase === 'not-implemented') {
    return <NotImplementedState message={state.message} cliCommand={cliCommand} />
  }
  if (state.phase === 'error') return <ErrorState message={state.message} />

  const { real, imaginary, bundle, details } = state.data
  const components = [
    { label: 'Real component', artifact: real },
    { label: 'Imaginary component', artifact: imaginary },
  ]

  return (
    <div className="flex min-h-64 flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Cipher pair ready</p>
          <p className="text-xs text-muted-foreground">
            Download the components separately or keep the complete bundle.
          </p>
        </div>
        {bundle.url ? (
          <Button asChild size="sm" variant="outline">
            <a href={bundle.url} download={bundle.name}>
              <Download className="size-4" />
              Download ZIP
            </a>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {components.map(({ label, artifact }) => (
          <div key={label} className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{label}</p>
              {artifact.url ? (
                <Button asChild size="sm" variant="ghost">
                  <a href={artifact.url} download={artifact.name}>
                    <Download className="size-4" />
                    Save
                  </a>
                </Button>
              ) : null}
            </div>
            {artifact.url ? (
              <img
                src={artifact.url}
                alt={label}
                loading="lazy"
                decoding="async"
                className="h-44 w-full border border-plate-edge bg-plate object-contain"
              />
            ) : null}
            <p className="truncate text-xs text-muted-foreground">
              {artifact.byteLength === null
                ? artifact.mimeType
                : `${formatBytes(artifact.byteLength)} ${artifact.mimeType}`}
            </p>
          </div>
        ))}
      </div>

      {details.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3">
          {details.map((detail) => (
            <div key={detail.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{detail.label}</dt>
              <dd className="tabular truncate font-mono text-sm">{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

export const CipherPairResultPanel = memo(CipherPairResultPanelImpl)
