import { AlertTriangle, Loader2, PlugZap } from 'lucide-react'
import { memo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** Hoisted: a constant tree, so it is allocated once rather than per render. */
const RUNNING_SKELETON = (
  <div className="flex flex-col gap-3">
    <Skeleton className="h-36 w-full" />
    <Skeleton className="h-4 w-2/3" />
    <Skeleton className="h-4 w-1/3" />
  </div>
)

function IdleStateImpl({
  hint,
  tone,
}: {
  hint: string
  tone: 'image' | 'audio'
}) {
  return (
    <div className="flex min-h-64 flex-col justify-center gap-3">
      <span
        className={cn('h-px w-8', tone === 'image' ? 'bg-image' : 'bg-audio')}
        aria-hidden
      />
      <p className="max-w-[38ch] text-sm text-muted-foreground text-pretty">
        {hint}
      </p>
    </div>
  )
}

function RunningStateImpl() {
  return (
    <div className="flex min-h-64 flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        <span>Working…</span>
      </div>
      {RUNNING_SKELETON}
    </div>
  )
}

function NotImplementedStateImpl({
  message,
  cliCommand,
}: {
  message: string
  cliCommand: string
}) {
  return (
    <div className="flex min-h-64 flex-col gap-4 rounded-lg border border-border bg-muted/40 p-5">
      <div className="flex items-center gap-2">
        <PlugZap className="size-4 text-muted-foreground" aria-hidden />
        <Badge variant="notice">Backend not connected</Badge>
      </div>

      <p className="text-sm text-foreground">{message}</p>

      <div className="flex flex-col gap-1.5">
        <span className="type-narrow text-xs text-muted-foreground">
          The same call, on the command line
        </span>
        <code className="overflow-x-auto border border-border bg-plate px-3 py-2 font-mono text-xs whitespace-pre text-foreground">
          {cliCommand}
        </code>
      </div>
    </div>
  )
}

function ErrorStateImpl({ message }: { message: string }) {
  return (
    <div className="flex min-h-64 flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-destructive" aria-hidden />
        <Badge variant="destructive">Failed</Badge>
      </div>
      <p className="text-sm text-foreground">{message}</p>
    </div>
  )
}

export const IdleState = memo(IdleStateImpl)
export const RunningState = memo(RunningStateImpl)
export const NotImplementedState = memo(NotImplementedStateImpl)
export const ErrorState = memo(ErrorStateImpl)
