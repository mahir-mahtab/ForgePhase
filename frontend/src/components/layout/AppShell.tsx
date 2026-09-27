import { ChevronDown, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BackendStatus } from '@/components/layout/BackendStatus'
import { Logo } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import { SECTIONS, type ToolItem, searchTools } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import type { DomainKind } from '@/services/types'

interface AppShellProps {
  section: DomainKind
  /** The open tool in each section, so the sidebar can mark both. */
  tools: Readonly<Record<DomainKind, string>>
  onNavigate: (section: DomainKind, tool: string) => void
  children: ReactNode
}

type DomainFilter = DomainKind | 'all'

const COLLAPSED_KEY = 'phaseforge:sidebar-collapsed'
const FILTERS: ReadonlyArray<{ id: DomainFilter; label: string; count: number }> = [
  ...SECTIONS.map((group) => ({ id: group.id, label: group.label, count: group.tools.length })),
  { id: 'all', label: 'All', count: SECTIONS.reduce((sum, group) => sum + group.tools.length, 0) },
]

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(value))
  } catch {
    // Storage can be unavailable (private mode); the toggle still works for this visit.
  }
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo className="size-9" />
      <span className="font-display font-medium text-2xl leading-none tracking-tight">PhaseForge</span>
    </div>
  )
}

function ToolButton({
  tool,
  isActive,
  tag,
  onSelect,
}: {
  tool: ToolItem
  isActive: boolean
  /** Section name, shown in search results where both sections mix. */
  tag?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-current={isActive ? 'page' : undefined}
      onClick={onSelect}
      className={cn(
        'focus-ring group flex items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition-colors',
        isActive
          ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
          : 'text-muted-foreground hover:bg-sidebar-hover hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
          isActive
            ? 'bg-highlight text-highlight-foreground'
            : 'text-muted-foreground group-hover:bg-card group-hover:text-foreground',
        )}
      >
        <tool.icon className="size-4" aria-hidden />
      </span>
      <span className="truncate">{tool.label}</span>
      {tag ? (
        <span className="ml-auto text-[0.6875rem] font-normal text-muted-foreground">{tag}</span>
      ) : null}
    </button>
  )
}

function AppShellImpl({
  section,
  tools,
  onNavigate,
  children,
}: AppShellProps) {
  const status = useBackendStatus()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(readCollapsed)
  const [showAll, setShowAll] = useState(false)
  const domainFilter: DomainFilter = showAll ? 'all' : section
  const [closedGroups, setClosedGroups] = useState<Partial<Record<DomainKind, boolean>>>({})
  const [query, setQuery] = useState('')
  // The sidebar renders twice (desktop and drawer), so each copy gets its own input ref.
  const [focusSearch, setFocusSearch] = useState<'desktop' | 'drawer' | null>(null)
  const desktopSearchRef = useRef<HTMLInputElement>(null)
  const drawerSearchRef = useRef<HTMLInputElement>(null)

  const setCollapsed = useCallback((value: boolean) => {
    setIsCollapsed(value)
    writeCollapsed(value)
  }, [])

  // The filter box only exists in the expanded sidebar, so focus it once that has rendered.
  useEffect(() => {
    if (!focusSearch) return
    ;(focusSearch === 'desktop' ? desktopSearchRef : drawerSearchRef).current?.focus()
    setFocusSearch(null)
  }, [focusSearch])

  // Ctrl/Cmd+B toggles the rail, "/" jumps to the filter, Escape clears it or closes the drawer.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setCollapsed(!isCollapsed)
      } else if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        if (window.matchMedia('(min-width: 64rem)').matches) {
          setCollapsed(false)
          setFocusSearch('desktop')
        } else {
          setDrawerOpen(true)
          setFocusSearch('drawer')
        }
      } else if (event.key === 'Escape') {
        if (query && target?.getAttribute('type') === 'search') setQuery('')
        else if (drawerOpen) setDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isCollapsed, setCollapsed, query, drawerOpen])

  const selectFilter = (next: DomainFilter) => {
    setShowAll(next === 'all')
    if (next !== 'all' && next !== section) onNavigate(next, tools[next])
  }

  const selectTool = (domain: DomainKind, tool: string) => {
    onNavigate(domain, tool)
    setDrawerOpen(false)
  }

  const results = useMemo(() => (query.trim() ? searchTools(query) : null), [query])
  const visibleSections =
    domainFilter === 'all' ? SECTIONS : SECTIONS.filter((group) => group.id === domainFilter)
  const activeGroup = SECTIONS.find((group) => group.id === section) ?? SECTIONS[0]
  const activeTool = activeGroup.tools.find((tool) => tool.value === tools[section])

  const renderSidebar = (isMobile: boolean) => (
    <div className="flex h-full flex-col gap-5 px-4 py-5">
      <div className="flex items-center justify-between border-b border-border px-2 pb-5">
        <Wordmark />
        {isMobile ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          >
            <X />
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Collapse sidebar"
                onClick={() => setCollapsed(true)}
                className="text-muted-foreground hover:text-foreground"
              >
                <PanelLeftClose />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Collapse (Ctrl+B)</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div role="group" aria-label="Show tools" className="flex gap-1 rounded-xl bg-secondary/60 p-1">
          {FILTERS.map((filter) => {
            const selected = domainFilter === filter.id
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectFilter(filter.id)}
                className={cn(
                  'focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                  selected
                    ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {filter.label}
                <span className="font-mono text-[0.625rem] text-muted-foreground">{filter.count}</span>
              </button>
            )
          })}
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            ref={isMobile ? drawerSearchRef : desktopSearchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter tools"
            aria-label="Filter tools"
            className="focus-ring w-full rounded-xl border border-border bg-card/60 py-2 pr-8 pl-8.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:bg-card [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear filter"
              className="focus-ring absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-border bg-secondary px-1.5 font-mono text-[0.625rem] leading-4 text-muted-foreground lg:block">
              /
            </kbd>
          )}
        </div>
      </div>

      <nav
        aria-label="Tools"
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 [scrollbar-width:thin]"
      >
        {results ? (
          results.length ? (
            <div className="flex flex-col gap-1">
              {results.map(({ domain, domainLabel, tool }) => (
                <ToolButton
                  key={`${domain}-${tool.value}`}
                  tool={tool}
                  tag={domainLabel}
                  isActive={domain === section && tools[domain] === tool.value}
                  onSelect={() => selectTool(domain, tool.value)}
                />
              ))}
            </div>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No tools match &ldquo;{query.trim()}&rdquo;.
            </p>
          )
        ) : (
          visibleSections.map((group) => {
            const open = !closedGroups[group.id]
            return (
              <div key={group.id} className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setClosedGroups((prev) => ({ ...prev, [group.id]: open }))}
                  className="focus-ring flex items-center gap-2 rounded-md px-3 pb-2 text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-foreground"
                >
                  <group.icon className="size-3.5" aria-hidden />
                  {group.label}
                  <span aria-hidden className="ml-1 h-px flex-1 bg-border" />
                  <ChevronDown
                    className={cn('size-3.5 transition-transform', !open && '-rotate-90')}
                    aria-hidden
                  />
                </button>
                {open
                  ? group.tools.map((tool) => (
                      <ToolButton
                        key={tool.value}
                        tool={tool}
                        isActive={group.id === section && tools[group.id] === tool.value}
                        onSelect={() => selectTool(group.id, tool.value)}
                      />
                    ))
                  : null}
              </div>
            )
          })
        )}
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-border px-1 pt-4">
        <BackendStatus status={status} />
        <ThemeToggle />
      </div>
    </div>
  )

  const rail = (
    <div className="flex h-full flex-col items-center gap-4 py-5">
      <Logo className="size-9" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Expand sidebar"
            onClick={() => setCollapsed(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <PanelLeftOpen />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Expand (Ctrl+B)</TooltipContent>
      </Tooltip>

      <div role="group" aria-label="Section" className="flex flex-col gap-1 rounded-xl bg-secondary/60 p-1">
        {SECTIONS.map((group) => (
          <Tooltip key={group.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={section === group.id}
                aria-label={group.label}
                onClick={() => onNavigate(group.id, tools[group.id])}
                className={cn(
                  'focus-ring flex size-8 items-center justify-center rounded-lg transition-colors',
                  section === group.id
                    ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <group.icon className="size-4" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{group.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <nav
        aria-label="Tools"
        className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto border-t border-border pt-4 [scrollbar-width:none]"
      >
        {activeGroup.tools.map((tool) => {
          const isActive = tools[section] === tool.value
          return (
            <Tooltip key={tool.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={tool.label}
                  onClick={() => onNavigate(section, tool.value)}
                  className={cn(
                    'focus-ring flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                    isActive
                      ? 'bg-highlight text-highlight-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-hover hover:text-foreground',
                  )}
                >
                  <tool.icon className="size-4" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-56">
                <p className="font-semibold">{tool.label}</p>
                <p className="text-muted-foreground">{tool.description}</p>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </nav>

      <div className="flex flex-col items-center gap-1 border-t border-border pt-4">
        <BackendStatus status={status} compact />
        <ThemeToggle />
      </div>
    </div>
  )

  return (
    <div
      className={cn(
        'min-h-dvh bg-background transition-[padding] duration-200 ease-out',
        isCollapsed ? 'lg:pl-18' : 'lg:pl-72',
      )}
    >
      {/* Desktop: a fixed sidebar that collapses to an icon rail. */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden overflow-hidden border-r border-border bg-sidebar transition-[width] duration-200 ease-out lg:block',
          isCollapsed ? 'w-18' : 'w-72',
        )}
      >
        {isCollapsed ? rail : renderSidebar(false)}
      </aside>

      {/* Mobile: the same sidebar as a drawer. */}
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
          {renderSidebar(true)}
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
        {activeTool ? (
          <span className="ml-auto hidden text-sm text-muted-foreground sm:block">
            {activeGroup.label} / <span className="text-foreground">{activeTool.label}</span>
          </span>
        ) : null}
      </header>

      <div className="flex min-h-dvh flex-col">
        {status.state === 'offline' ? (
          <div role="alert" className="border-b border-border bg-warning-soft">
            <p className="mx-auto max-w-6xl px-4 py-2.5 text-sm text-warning sm:px-8">
              Backend offline. Run <code className="font-mono text-xs">uvicorn phaseforge.api.app:app --port 8000</code> in <code className="font-mono text-xs">backend/</code>.
            </p>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 lg:py-12">
          {children}
        </main>

        <footer className="border-t border-border">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-8">
            Educational cipher. Not for protecting real secrets.
          </p>
        </footer>
      </div>
    </div>
  )
}

export const AppShell = memo(AppShellImpl)
