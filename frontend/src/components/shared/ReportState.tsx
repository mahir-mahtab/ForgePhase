import type { ReactNode } from 'react'

import { ErrorState, IdleState, RunningState } from '@/components/shared/StateFallback'
import type { OperationState } from '@/hooks/useOperation'

/** Idle, running and error states around a JSON result's own renderer. */
export function ReportState<T>({
  state,
  idleHint,
  render,
}: {
  state: OperationState<T>
  idleHint: string
  render: (data: T) => ReactNode
}) {
  if (state.phase === 'idle') return <IdleState hint={idleHint} />
  if (state.phase === 'running') return <RunningState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  return <>{render(state.data)}</>
}
