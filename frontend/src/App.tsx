import { Suspense, lazy, useCallback, useState } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Logo } from '@/components/layout/Logo'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { AudioTool, ImageTool } from '@/lib/navigation'
import type { DomainKind } from '@/services/types'

/**
 * Each workspace is its own chunk. Only a section that has been opened is
 * downloaded, so opening the app does not pay for both.
 */
const ImageWorkspace = lazy(() => import('@/features/image/ImageWorkspace'))
const AudioWorkspace = lazy(() => import('@/features/audio/AudioWorkspace'))

/** Hoisted: the fallback never varies, so it should not rebuild per render. */
const WORKSPACE_FALLBACK = (
  <div role="status" className="flex min-h-96 flex-col items-center justify-center gap-3">
    <Logo className="logo-breathe size-12" />
    <p className="text-sm text-muted-foreground">Loading workspace…</p>
  </div>
)

export default function App() {
  const [section, setSection] = useState<DomainKind>('image')
  const [visited, setVisited] = useState<ReadonlySet<DomainKind>>(() => new Set(['image']))
  const [tools, setTools] = useState<{ image: ImageTool; audio: AudioTool }>({
    image: 'encrypt',
    audio: 'encrypt',
  })

  const handleNavigate = useCallback((next: DomainKind, tool: string) => {
    setSection(next)
    setTools((previous) => ({ ...previous, [next]: tool }))
    setVisited((previous) => (previous.has(next) ? previous : new Set([...previous, next])))
  }, [])

  const setImageTool = useCallback((tool: ImageTool) => handleNavigate('image', tool), [handleNavigate])
  const setAudioTool = useCallback((tool: AudioTool) => handleNavigate('audio', tool), [handleNavigate])

  return (
    <TooltipProvider>
      <AppShell
        section={section}
        tools={tools}
        onNavigate={handleNavigate}
      >
        {/*
          Visited workspaces stay mounted and are only hidden, so files, form
          values and results survive switching between Image and Audio.
        */}
        {visited.has('image') ? (
          <div hidden={section !== 'image'}>
            <ErrorBoundary>
              <Suspense fallback={WORKSPACE_FALLBACK}>
                <ImageWorkspace tool={tools.image} onToolChange={setImageTool} />
              </Suspense>
            </ErrorBoundary>
          </div>
        ) : null}
        {visited.has('audio') ? (
          <div hidden={section !== 'audio'}>
            <ErrorBoundary>
              <Suspense fallback={WORKSPACE_FALLBACK}>
                <AudioWorkspace tool={tools.audio} onToolChange={setAudioTool} />
              </Suspense>
            </ErrorBoundary>
          </div>
        ) : null}
      </AppShell>
    </TooltipProvider>
  )
}
