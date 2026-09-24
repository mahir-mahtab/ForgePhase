import { Menu, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { memo, useEffect, useState } from 'react'

import { BackendSelect } from '@/components/layout/BackendSelect'
import { BackendStatus } from '@/components/layout/BackendStatus'
import { Logo } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Button } from '@/components/ui/button'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import { SECTIONS } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import type { DomainKind, TransformBackend } from '@/services/types'

interface AppShellProps {
  section: DomainKind
  /** The open tool in each section, so the sidebar can mark both. */
  tools: Readonly<Record<DomainKind, string>>
  onNavigate: (section: DomainKind, tool: string) => void
  backend: TransformBackend
  onBackendChange: (backend: TransformBackend) => void
  children: ReactNode
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo className="size-8" />
      <span className="font-display text-2xl leading-none tracking-tight">PhaseForge</span>
    </div>
  )
}

function AppShellImpl({
  section,
  tools,
  onNavigate,
  backend,
  onBackendChange,
  children,
}: AppShellProps) {
  const status = useBackendStatus()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Escape closes the mobile drawer, as it would any other overlay.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const sidebar = (
    <div className="flex h-full flex-col gap-6 px-4 py-5">
      <div className="flex items-center justify-between px-2">
        <Wordmark />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
        >
          <X />
        </Button>
      </div>

      <nav aria-label="Tools" className="-mx-1 flex flex-1 flex-col gap-6 overflow-y-auto px-1 [scrollbar-width:thin]">
        {SECTIONS.map((group) => (
          <div key={group.id} className="flex flex-col gap-1">
            <p className="flex items-center gap-2 px-3 pb-1 text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              <group.icon className="size-3.5" aria-hidden />
              {group.label}
            </p>
            {group.tools.map((tool) => {
              const isActive = group.id === section && tools[group.id] === tool.value
              return (
                <button
                  key={tool.value}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    onNavigate(group.id, tool.value)
                    setDrawerOpen(false)
                  }}
                  className={cn(
                    'focus-ring group flex items-center gap-3 rounded-full px-3 py-2 text-left text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-card text-foreground shadow-[0_1px_0_var(--border),0_0_0_1px_var(--border)]'
                      : 'text-muted-foreground hover:bg-sidebar-hover hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full transition-colors',
                      isActive
                        ? 'bg-highlight text-highlight-foreground'
                        : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  >
                    <tool.icon className="size-4" aria-hidden />
                  </span>
                  {tool.label}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <BackendStatus status={status} />
          <ThemeToggle />
        </div>
        <BackendSelect value={backend} onChange={onBackendChange} />
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh bg-background lg:pl-68">
      {/* Desktop: a fixed rail. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 border-r border-border bg-sidebar lg:block">
        {sidebar}
      </aside>

      {/* Mobile: the same rail as a drawer. */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden',
          drawerOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <div
          className={cn(
            'absolute inset-0 bg-foreground/30 transition-opacity',
            drawerOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setDrawerOpen(false)}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-border bg-sidebar shadow-xl transition-transform',
            drawerOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {sidebar}
        </aside>
      </div>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Open navigation"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu />
        </Button>
        <Wordmark />
      </header>

      <div className="flex min-h-dvh flex-col">
        {status.state === 'offline' ? (
          <div role="alert" className="border-b border-border bg-warning-soft">
            <p className="mx-auto max-w-6xl px-4 py-2.5 text-sm text-warning sm:px-8">
              The PhaseForge API is not reachable. Start it from{' '}
              <code className="font-mono text-xs">backend/</code> with{' '}
              <code className="font-mono text-xs">
                uvicorn phaseforge.api.app:app --port 8000
              </code>
              .
            </p>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 lg:py-12">
          {children}
        </main>

        <footer className="border-t border-border">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-8">
            Double random phase encoding is a teaching cipher: it is linear, has no
            integrity check, and breaks under key reuse. Do not use it to protect real
            secrets.
          </p>
        </footer>
      </div>
    </div>
  )
}

export const AppShell = memo(AppShellImpl)
