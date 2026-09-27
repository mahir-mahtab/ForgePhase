import { AlertCircle } from 'lucide-react'
import { memo } from 'react'

import { PhaseLoader } from '@/components/shared/PhaseLoader'

function IdleStateImpl({ hint }: { hint: string }) {
  return (
    <div className="flex min-h-56 items-center justify-center rounded-md border border-dashed border-border p-6 text-center">
      <p className="max-w-[40ch] text-sm text-muted-foreground text-pretty">{hint}</p>
    </div>
  )
}

function RunningStateImpl() {
  return (
    <PhaseLoader className="min-h-56 rounded-md border border-border bg-muted/30 p-6" />
  )
}

function ErrorStateImpl({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-6 text-center"
    >
      <AlertCircle className="size-5 text-destructive" aria-hidden />
      <p className="text-sm font-medium">That didn’t work</p>
      <p className="max-w-[48ch] text-sm text-muted-foreground text-pretty">{message}</p>
    </div>
  )
}

export const IdleState = memo(IdleStateImpl)
export const RunningState = memo(RunningStateImpl)
export const ErrorState = memo(ErrorStateImpl)
