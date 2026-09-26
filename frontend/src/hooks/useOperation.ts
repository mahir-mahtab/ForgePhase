import { useCallback, useEffect, useRef, useState } from 'react'

import { AbortedError } from '@/services/client'
import type { ServiceResult } from '@/services/types'

import { useLatest } from '@/hooks/useLatest'

export type OperationState<T> =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'ok'; data: T }
  | { phase: 'not-implemented'; message: string }
  | { phase: 'error'; message: string }

const IDLE = { phase: 'idle' } as const
const RUNNING = { phase: 'running' } as const

/**
 * Runs one service call and tracks its lifecycle.
 *
 * A single in-flight request at a time: starting a new one aborts the previous,
 * so a fast double-click cannot leave a stale response to overwrite a fresh
 * one. The abort also fires on unmount.
 */
export function useOperation<TRequest extends { signal?: AbortSignal }, TResponse>(
  run: (request: TRequest) => Promise<ServiceResult<TResponse>>,
) {
  const [state, setState] = useState<OperationState<TResponse>>(IDLE)
  const controllerRef = useRef<AbortController | null>(null)

  // The caller usually passes an inline arrow. Reading it through a ref keeps
  // `execute` stable, so memoized panels below do not re-render on every keystroke.
  const runRef = useLatest(run)

  useEffect(
    () => () => {
      controllerRef.current?.abort()
    },
    [],
  )

  const execute = useCallback(
    async (request: Omit<TRequest, "signal">) => {
      controllerRef.current?.abort()

      const controller = new AbortController()
      controllerRef.current = controller
      setState(RUNNING)

      try {
        const result = await runRef.current({
          ...request,
          signal: controller.signal,
        } as TRequest)

        // A newer call already took over; its result is the one that counts.
        if (controller.signal.aborted) return

        setState(
          result.status === 'ok'
            ? { phase: 'ok', data: result.data }
            : { phase: result.status, message: result.message },
        )
      } catch (error) {
        if (error instanceof AbortedError || controller.signal.aborted) return
        setState({
          phase: 'error',
          message:
            error instanceof Error ? error.message : 'Something went wrong.',
        })
      }
    },
    [runRef],
  )

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setState(IDLE)
  }, [])

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setState(IDLE)
  }, [])

  return { state, execute, cancel, reset }
}
