import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { memo } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface OperationShellProps {
  title: string
  description: string
  /** Form controls. */
  children: ReactNode
  /** Right-hand column: the result, or a live readout. */
  result: ReactNode
  runLabel: string
  canRun: boolean
  /** Why the run button is disabled, shown beside it. */
  blockedReason?: string
  isRunning: boolean
  hasResult: boolean
  onRun: () => void
  /** Cancels a running request, or clears a finished result. */
  onReset: () => void
  /** The equivalent `phaseforge` command line, offered for copying. */
  command?: string
}

function OperationShellImpl({
  title,
  description,
  children,
  result,
  runLabel,
  canRun,
  blockedReason,
  isRunning,
  hasResult,
  onRun,
  onReset,
  command,
}: OperationShellProps) {
  return (
    <Card>
      <div className="border-b border-border px-6 py-5">
        <h3 className="font-display font-medium text-2xl leading-tight">{title}</h3>
        <p className="mt-1 max-w-[75ch] text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="grid lg:grid-cols-2">
        <form
          className="flex flex-col gap-5 p-6"
          onSubmit={(event) => {
            event.preventDefault()
            if (canRun && !isRunning) onRun()
          }}
        >
          {children}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" disabled={!canRun || isRunning}>
              {isRunning ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {runLabel}
            </Button>
            {isRunning || hasResult ? (
              <Button type="button" variant="ghost" onClick={onReset}>
                {isRunning ? 'Cancel' : 'Clear'}
              </Button>
            ) : null}
            {!canRun && !isRunning && blockedReason ? (
              <p className="text-xs text-muted-foreground">{blockedReason}</p>
            ) : null}
          </div>

          {command ? (
            <details className="group text-xs text-muted-foreground">
              <summary className="focus-ring w-fit cursor-pointer rounded-sm select-none hover:text-foreground">
                Command-line equivalent
              </summary>
              <code className="mt-2 block overflow-x-auto rounded-md border border-border bg-plate px-3 py-2 font-mono whitespace-pre text-foreground">
                {command}
              </code>
            </details>
          ) : null}
        </form>

        <div className="flex min-w-0 flex-col gap-4 border-t border-border bg-plate/40 p-6 lg:border-t-0 lg:border-l">
          {result}
        </div>
      </div>
    </Card>
  )
}

export const OperationShell = memo(OperationShellImpl)
