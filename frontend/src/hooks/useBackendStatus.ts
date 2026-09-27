import { useEffect, useState } from 'react'

import { fetchBackendInfo } from '@/services/client'
import type { BackendInfo } from '@/services/types'

export type BackendStatus =
  | { state: 'checking' }
  | { state: 'online'; info: BackendInfo }
  | { state: 'offline' }

const POLL_MS = 15_000

/** Polls `/api/info` so the header can say whether the API is reachable. */
export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>({ state: 'checking' })

  useEffect(() => {
    let controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    async function check() {
      const info = await fetchBackendInfo(controller.signal)
      if (controller.signal.aborted) return
      setStatus(info ? { state: 'online', info } : { state: 'offline' })
      timer = setTimeout(poll, POLL_MS)
    }

    function poll() {
      controller = new AbortController()
      void check()
    }

    // Re-check straight away when the tab regains focus, e.g. after the user
    // has gone to start the backend.
    function onFocus() {
      clearTimeout(timer)
      controller.abort()
      poll()
    }

    void check()
    window.addEventListener('focus', onFocus)
    return () => {
      controller.abort()
      clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return status
}
