import { Loader2, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { memo } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type Tone = 'image' | 'audio'

interface OperationShellProps {
  tone: Tone
  icon: ReactNode
  title: string
  description: string
  /** The `phaseforge` subcommand this panel stands in for. */
  command: string
  /** Form controls. */
  children: ReactNode
  /** Right-hand column: a result panel, a live readout, or both. */
  result: ReactNode
  runLabel: string
  canRun: boolean
  /** Why the run button is disabled, shown beside it. */
  blockedReason?: string
  isRunning: boolean
  hasResult: boolean
  onRun: () => void
  onReset: () => void
}

const TONE = {
  image: { mark: 'bg-image text-image-ink', button: 'image' },
  audio: { mark: 'bg-audio text-audio-ink', button: 'audio' },
} as const

function OperationShellImpl({
  tone,
  icon,
  title,
  description,
  command,
  children,
  result,
  runLabel,
  canRun,
  blockedReason,
  isRunning,
  hasResult,
  onRun,
  onReset,
}: OperationShellProps) {
  const toneStyles = TONE[tone]

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          {/*
            A solid block of the channel's colour, square like the plates.
            It carries the routing, so the panel needs no coloured rail on top.
          */}
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center',
              toneStyles.mark,
            )}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <CardTitle className="type-heading text-[1.0625rem]">
              {title}
            </CardTitle>
            <CardDescription className="mt-1.5 max-w-[62ch]">
              {description}
            </CardDescription>
          </div>
        </div>

        <code className="type-narrow shrink-0 self-start font-mono text-xs text-muted-foreground">
          {command}
        </code>
      </CardHeader>

      <CardContent className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-0">
        <div className="flex flex-col gap-5 lg:pr-8">{children}</div>
        {/*
          The rule is the structure: what you give on the left, what comes back
          on the right. It replaces a heading that only restated the layout.
        */}
        <div className="flex flex-col gap-3 lg:border-l lg:border-border lg:pl-8">
          {result}
        </div>
      </CardContent>

      <CardFooter className="flex-wrap justify-between gap-y-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={toneStyles.button}
            disabled={!canRun || isRunning}
            onClick={onRun}
          >
            {isRunning ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {runLabel}
          </Button>

          {hasResult || isRunning ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear result"
              onClick={onReset}
            >
              <RotateCcw className="size-4" />
            </Button>
          ) : null}
        </div>

        {!canRun && blockedReason ? (
          <p className="text-xs text-muted-foreground">{blockedReason}</p>
        ) : null}
      </CardFooter>
    </Card>
  )
}

export const OperationShell = memo(OperationShellImpl)
