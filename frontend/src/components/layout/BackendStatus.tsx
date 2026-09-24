import { memo } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { BackendStatus as Status } from '@/hooks/useBackendStatus'
import { cn } from '@/lib/utils'

const LABELS = {
  checking: 'Connecting…',
  online: 'API connected',
  offline: 'API offline',
} as const

function BackendStatusImpl({ status }: { status: Status }) {
  const tip =
    status.state === 'online'
      ? `PhaseForge API v${status.info.version} is reachable.`
      : status.state === 'offline'
        ? 'Start the backend: uvicorn phaseforge.api.app:app --port 8000'
        : 'Checking the backend…'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="status"
          className="focus-ring inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground"
        >
          <span
            aria-hidden
            className={cn(
              'size-2 rounded-full',
              status.state === 'online' && 'bg-success',
              status.state === 'offline' && 'bg-destructive',
              status.state === 'checking' && 'animate-pulse bg-muted-foreground',
            )}
          />
          <span>{LABELS[status.state]}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

export const BackendStatus = memo(BackendStatusImpl)
