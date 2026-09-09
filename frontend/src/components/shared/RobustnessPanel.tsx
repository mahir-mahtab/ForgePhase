import { ShieldAlert } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { MetricsTable } from '@/components/shared/MetricsTable'
import { OperationShell } from '@/components/shared/OperationShell'
import { PassphraseField } from '@/components/shared/PassphraseField'
import {
  ErrorState,
  IdleState,
  NotImplementedState,
  RunningState,
} from '@/components/shared/StateFallback'
import type { OperationState } from '@/hooks/useOperation'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_CONTAINER } from '@/lib/accept'
import type {
  AttackReportRequest,
  RobustnessReport,
  ServiceResult,
  TransformBackend,
} from '@/services/types'

const ICON = <ShieldAlert className="size-4" aria-hidden />

const IDLE_HINT =
  'One row per attack — untouched, noise, occlusion, coarse quantization — with what survives decryption in each case.'

interface RobustnessPanelProps {
  tone: 'image' | 'audio'
  /** File types accepted for the plaintext side of the comparison. */
  originalAccept: string
  originalKind: 'image' | 'audio'
  originalLabel: string
  run: (
    request: AttackReportRequest,
  ) => Promise<ServiceResult<RobustnessReport>>
  backend: TransformBackend
}

function ReportBody({
  state,
  cliCommand,
  tone,
}: {
  state: OperationState<RobustnessReport>
  cliCommand: string
  tone: 'image' | 'audio'
}) {
  if (state.phase === 'idle') return <IdleState hint={IDLE_HINT} tone={tone} />
  if (state.phase === 'running') return <RunningState />
  if (state.phase === 'not-implemented') {
    return (
      <NotImplementedState message={state.message} cliCommand={cliCommand} />
    )
  }
  if (state.phase === 'error') return <ErrorState message={state.message} />

  return <MetricsTable report={state.data} />
}

export function RobustnessPanel({
  tone,
  originalAccept,
  originalKind,
  originalLabel,
  run,
  backend,
}: RobustnessPanelProps) {
  const [ciphertext, setCiphertext] = useState<File | null>(null)
  const [original, setOriginal] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const { state, execute, reset } = useOperation(run)

  const isRunning = state.phase === 'running'
  const canRun =
    ciphertext !== null && original !== null && passphrase.length > 0

  const handleRun = useCallback(() => {
    if (!ciphertext || !original) return
    void execute({ ciphertext, original, passphrase, backend })
  }, [backend, ciphertext, execute, original, passphrase])

  const command = [
    'phaseforge --backend',
    backend,
    'attack-report',
    ciphertext?.name ?? '<cipher.npz>',
    original?.name ?? '<original>',
  ].join(' ')

  return (
    <OperationShell
      tone={tone}
      icon={ICON}
      title="Robustness report"
      description="Damages the ciphertext, decrypts each damaged copy with the correct key, and scores what is left against the original. Measures resilience, not secrecy."
      command="attack-report"
      runLabel="Run report"
      canRun={canRun}
      blockedReason="Needs the container, the matching plaintext, and the passphrase"
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      result={
        <ReportBody state={state} cliCommand={command} tone={tone} />
      }
    >
      <FileDropzone
        label="Ciphertext container"
        hint=".npz"
        kind="container"
        accept={ACCEPT_CONTAINER}
        tone={tone}
        file={ciphertext}
        onFileChange={setCiphertext}
        disabled={isRunning}
      />

      <FileDropzone
        label={originalLabel}
        hint="for comparison"
        kind={originalKind}
        accept={originalAccept}
        tone={tone}
        file={original}
        onFileChange={setOriginal}
        disabled={isRunning}
      />

      <PassphraseField
        value={passphrase}
        onChange={setPassphrase}
        hint="The correct passphrase. The point is to measure damage, not to test the key."
        disabled={isRunning}
      />
    </OperationShell>
  )
}
