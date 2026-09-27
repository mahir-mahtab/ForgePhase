import { memo } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { BackendStatus as Status } from '@/hooks/useBackendStatus'
import { cn } from '@/lib/utils'

const LABELS = {
  checking: 'Connecting…',
  online: 'API connected',
  offline: 'API offline',
} as const

interface BackendStatusProps {
  status: Status
  compact?: boolean
  className?: string
}

function BackendStatusImpl({ status, compact = false, className }: BackendStatusProps) {
  const tip =
    status.state === 'online'
      ? `PhaseForge API v${status.info.version} is reachable.`
      : status.state === 'offline'
        ? 'Start the backend: uvicorn phaseforge.api.app:app --port 8000'
        : 'Checking the backend…'

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            role="status"
            aria-label={`Backend: ${LABELS[status.state]}`}
            className={cn(
              'focus-ring flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground cursor-default',
              className,
            )}
          >
            <span
              aria-hidden
              className={cn(
                'size-2 rounded-full transition-transform',
                status.state === 'online' && 'bg-success ring-2 ring-success/20',
                status.state === 'offline' && 'bg-destructive ring-2 ring-destructive/20',
                status.state === 'checking' && 'animate-pulse bg-muted-foreground',
              )}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-foreground">{LABELS[status.state]}</span>
            <span className="text-muted-foreground">{tip}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="status"
          className={cn(
            'focus-ring inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground',
            className,
          )}
        >
          <span
            aria-hidden
            className={cn(
              'size-2 rounded-full transition-transform',
              status.state === 'online' && 'bg-success ring-2 ring-success/20',
              status.state === 'offline' && 'bg-destructive ring-2 ring-destructive/20',
              status.state === 'checking' && 'animate-pulse bg-muted-foreground',
            )}
          />
          <span className="font-medium">{LABELS[status.state]}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground">{LABELS[status.state]}</span>
          <span className="text-muted-foreground">{tip}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export const BackendStatus = memo(BackendStatusImpl)
