import { Suspense, lazy, useCallback, useState, useTransition } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DomainKind, TransformBackend } from '@/services/types'

/**
 * Each workspace is its own chunk. Only the section actually in view is
 * downloaded, so opening the app does not pay for both.
 */
const ImageWorkspace = lazy(() => import('@/features/image/ImageWorkspace'))
const AudioWorkspace = lazy(() => import('@/features/audio/AudioWorkspace'))

/** Hoisted: the fallback never varies, so it should not rebuild per render. */
const WORKSPACE_FALLBACK = (
  <div className="flex flex-col gap-8">
    <div className="flex flex-col gap-3">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-4 w-full max-w-2xl" />
    </div>
    <Skeleton className="h-20 w-full" />
    <Skeleton className="h-[28rem] w-full" />
  </div>
)

export default function App() {
  const [section, setSection] = useState<DomainKind>('image')
  const [backend, setBackend] = useState<TransformBackend>('numpy')
  const [, startTransition] = useTransition()

  const handleSectionChange = useCallback((next: DomainKind) => {
    // A transition keeps the current workspace painted while the next chunk
    // loads, instead of tearing it down to show the fallback.
    startTransition(() => {
      setSection(next)
    })
  }, [])

  return (
    <TooltipProvider>
      <AppShell
        section={section}
        onSectionChange={handleSectionChange}
        backend={backend}
        onBackendChange={setBackend}
      >
        <ErrorBoundary key={section}>
          <Suspense fallback={WORKSPACE_FALLBACK}>
            {section === 'image' ? (
              <ImageWorkspace backend={backend} />
            ) : (
              <AudioWorkspace backend={backend} />
            )}
          </Suspense>
        </ErrorBoundary>
      </AppShell>
    </TooltipProvider>
  )
}
