import type { ReactNode } from 'react'
import { memo } from 'react'

import { ArtifactView, DetailList, ResultCard } from '@/components/shared/ArtifactView'
import { ErrorState, IdleState, RunningState } from '@/components/shared/StateFallback'
import type { OperationState } from '@/hooks/useOperation'
import type { ArtifactResult } from '@/services/types'

interface ResultPanelProps {
  state: OperationState<ArtifactResult>
  /** Shown before the first run, so the panel explains itself. */
  idleHint: string
  /** Extra actions under a successful result. */
  actions?: (result: ArtifactResult) => ReactNode
  /** Rendered under the artifact on success, e.g. a caveat. */
  note?: ReactNode
}

function ResultPanelImpl({ state, idleHint, actions, note }: ResultPanelProps) {
  if (state.phase === 'idle') return <IdleState hint={idleHint} />
  if (state.phase === 'running') return <RunningState />
  if (state.phase === 'error') return <ErrorState message={state.message} />

  return (
    <ResultCard actions={actions?.(state.data)}>
      <ArtifactView artifact={state.data.artifact} />
      {note}
      <DetailList details={state.data.details} />
    </ResultCard>
  )
}

export const ResultPanel = memo(ResultPanelImpl)
