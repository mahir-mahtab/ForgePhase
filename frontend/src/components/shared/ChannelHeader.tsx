import { memo } from 'react'

import { PhaseField } from '@/components/shared/PhaseField'
import { cn } from '@/lib/utils'

interface ChannelHeaderProps {
  /** Which instrument channel this workspace is. Real routing information. */
  channel: 'ch1' | 'ch2'
  tone: 'image' | 'audio'
  title: string
  lede: string
  /** The field caption: what the reader is actually looking at. */
  fieldCaption: string
  /** Nameplate specs, set as a rule-separated list rather than tiles. */
  specs: ReadonlyArray<{ term: string; value: string }>
}

function ChannelHeaderImpl({
  channel,
  tone,
  title,
  lede,
  fieldCaption,
  specs,
}: ChannelHeaderProps) {
  const accent = tone === 'image' ? 'text-image' : 'text-audio'
  const rule = tone === 'image' ? 'bg-image' : 'bg-audio'

  return (
    <header className="grid gap-6 lg:grid-cols-[1fr_15rem] lg:items-end lg:gap-10">
      <div className="min-w-0">
        {/*
          The channel marker is a solid block of the channel's own colour with
          its number in it -- the same coding the sidebar and every run button
          use, so it reads as routing rather than as a label above a heading.
        */}
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'font-mono text-[0.6875rem] font-medium tracking-tight',
              accent,
            )}
          >
            {channel}
          </span>
          <span className={cn('h-px w-10 shrink-0', rule)} />
        </div>

        <h2 className="type-display mt-3 text-[clamp(1.75rem,3.6vw,2.6rem)] text-balance">
          {title}
        </h2>

        <p className="mt-3 max-w-[58ch] text-[0.9375rem] text-muted-foreground text-pretty">
          {lede}
        </p>

        <dl className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-border pt-4">
          {specs.map((spec) => (
            <div key={spec.term} className="flex items-baseline gap-2">
              <dt className="type-narrow text-xs text-muted-foreground">
                {spec.term}
              </dt>
              <dd className="tabular font-mono text-xs text-foreground">
                {spec.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <figure className="m-0">
        <PhaseField
          layout={tone === 'image' ? 'plane' : 'blocks'}
          tone={tone}
          className="block h-24 w-full border border-plate-edge sm:h-32"
        />
        <figcaption className="type-narrow mt-2 text-xs text-muted-foreground">
          {fieldCaption}
        </figcaption>
      </figure>
    </header>
  )
}

export const ChannelHeader = memo(ChannelHeaderImpl)
