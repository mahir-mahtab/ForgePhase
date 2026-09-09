import { AudioLines, ImageIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { memo } from 'react'

import { BackendSelect } from '@/components/layout/BackendSelect'
import { Logo } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { DomainKind, TransformBackend } from '@/services/types'

interface SectionMeta {
  id: DomainKind
  channel: string
  label: string
  blurb: string
  icon: ReactNode
  markClass: string
  textClass: string
}

/**
 * Module-level constant: the nav never changes, so building it once keeps a
 * stable identity and lets the memoized shell skip re-rendering entirely.
 */
const SECTIONS: readonly SectionMeta[] = [
  {
    id: 'image',
    channel: 'ch1',
    label: 'Image',
    blurb: 'Encrypt, watermark, filter, inspect',
    icon: <ImageIcon className="size-3.5" aria-hidden />,
    markClass: 'bg-image text-image-ink',
    textClass: 'text-image',
  },
  {
    id: 'audio',
    channel: 'ch2',
    label: 'Audio',
    blurb: 'Encrypt, denoise, enhance, inspect',
    icon: <AudioLines className="size-3.5" aria-hidden />,
    markClass: 'bg-audio text-audio-ink',
    textClass: 'text-audio',
  },
]

interface AppShellProps {
  section: DomainKind
  onSectionChange: (section: DomainKind) => void
  backend: TransformBackend
  onBackendChange: (backend: TransformBackend) => void
  children: ReactNode
}

function AppShellImpl({
  section,
  onSectionChange,
  backend,
  onBackendChange,
  children,
}: AppShellProps) {
  const active = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0]!

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <Logo className="size-6" />
          <span className="type-heading text-sm">PhaseForge</span>
        </div>

        <Separator />

        <nav aria-label="Channels" className="flex flex-col gap-1 p-3">
          {SECTIONS.map((item) => {
            const isActive = item.id === section
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  'group flex items-start gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors',
                  isActive ? 'bg-secondary' : 'hover:bg-secondary/60',
                )}
              >
                {/*
                  A solid channel block when live, an outline when idle. The
                  same marker appears on every panel and run button, so colour
                  means routing rather than decoration.
                */}
                <span
                  className={cn(
                    'mt-0.5 flex size-6 shrink-0 items-center justify-center border',
                    isActive
                      ? cn(item.markClass, 'border-transparent')
                      : 'border-input text-muted-foreground',
                  )}
                >
                  {item.icon}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        'text-sm font-medium',
                        isActive ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {item.label}
                    </span>
                    <span
                      className={cn(
                        'font-mono text-[0.625rem]',
                        isActive ? item.textClass : 'text-muted-foreground/70',
                      )}
                    >
                      {item.channel}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {item.blurb}
                  </span>
                </span>
              </button>
            )
          })}
        </nav>

        <div className="mt-auto border-t border-border p-4">
          <p className="text-xs text-foreground">No backend attached</p>
          <p className="mt-1 max-w-[34ch] text-xs text-muted-foreground">
            Controls, validation and result states all run. Each panel shows the
            command it would send.
          </p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-2 px-4 sm:gap-3 sm:px-8">
            <Logo className="size-6 lg:hidden" />

            <h1 className="hidden min-w-0 items-baseline gap-2 lg:flex">
              <span className="type-heading text-sm">{active.label}</span>
              <span className={cn('font-mono text-[0.625rem]', active.textClass)}>
                {active.channel}
              </span>
            </h1>

            {/* Mobile channel switcher: the sidebar's job at small widths. */}
            <div
              role="tablist"
              aria-label="Channels"
              className="flex items-center gap-1 rounded-md border border-border bg-muted p-1 lg:hidden"
            >
              {SECTIONS.map((item) => {
                const isActive = item.id === section
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={item.label}
                    onClick={() => onSectionChange(item.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm font-medium transition-colors',
                      isActive
                        ? item.markClass
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {item.icon}
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <BackendSelect value={backend} onChange={onBackendChange} />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 sm:py-12">
          {children}
        </main>
      </div>
    </div>
  )
}

export const AppShell = memo(AppShellImpl)
