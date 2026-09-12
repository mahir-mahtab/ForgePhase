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
import { ACCEPT_CONTAINER, ACCEPT_IMAGE } from '@/lib/accept'
import type {
  AttackReportRequest,
  ImageAttackReportRequest,
  RobustnessReport,
  ServiceResult,
  TransformBackend,
} from '@/services/types'

const ICON = <ShieldAlert className="size-4" aria-hidden />

const IDLE_HINT =
  'One row per attack — untouched, noise, occlusion, coarse quantization — with what survives decryption in each case.'

type RobustnessRequest = AttackReportRequest | ImageAttackReportRequest

interface RobustnessPanelProps<TRequest extends RobustnessRequest> {
  tone: 'image' | 'audio'
  /** File types accepted for the plaintext side of the comparison. */
  originalAccept: string
  originalKind: 'image' | 'audio'
  originalLabel: string
  run: (
    request: TRequest,
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

export function RobustnessPanel<TRequest extends RobustnessRequest>({
  tone,
  originalAccept,
  originalKind,
  originalLabel,
  run,
  backend,
}: RobustnessPanelProps<TRequest>) {
  const [ciphertext, setCiphertext] = useState<File | null>(null)
  const [realFile, setRealFile] = useState<File | null>(null)
  const [imaginaryFile, setImaginaryFile] = useState<File | null>(null)
  const [original, setOriginal] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const { state, execute, reset } = useOperation(run)

  const isRunning = state.phase === 'running'
  const canRun = tone === 'image'
    ? realFile !== null && imaginaryFile !== null && original !== null && passphrase.length > 0
    : ciphertext !== null && original !== null && passphrase.length > 0

  const handleRun = useCallback(() => {
    if (!original) return
    if (tone === 'image') {
      if (!realFile || !imaginaryFile) return
      void execute({ realFile, imaginaryFile, original, passphrase, backend } as unknown as Omit<TRequest, 'signal'>)
    } else {
      if (!ciphertext) return
      void execute({ ciphertext, original, passphrase, backend } as unknown as Omit<TRequest, 'signal'>)
    }
  }, [backend, ciphertext, execute, imaginaryFile, original, passphrase, realFile, tone])

  const command = tone === 'image'
    ? [
        'phaseforge --backend', backend, 'attack-report',
        realFile?.name ?? '<cipher-real.png>', original?.name ?? '<original>',
        '--imaginary', imaginaryFile?.name ?? '<cipher-imaginary.png>',
      ].join(' ')
    : [
        'phaseforge --backend', backend, 'attack-report',
        ciphertext?.name ?? '<cipher.npz>', original?.name ?? '<original>',
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
      blockedReason={tone === 'image'
        ? 'Needs both cipher PNGs, the matching plaintext, and the passphrase'
        : 'Needs the container, the matching plaintext, and the passphrase'}
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      result={
        <ReportBody state={state} cliCommand={command} tone={tone} />
      }
    >
      {tone === 'image' ? (
        <>
          <FileDropzone
            label="Real cipher component"
            hint="cipher-real.png"
            kind="image"
            accept={ACCEPT_IMAGE}
            tone={tone}
            file={realFile}
            onFileChange={setRealFile}
            disabled={isRunning}
          />
          <FileDropzone
            label="Imaginary cipher component"
            hint="cipher-imaginary.png"
            kind="image"
            accept={ACCEPT_IMAGE}
            tone={tone}
            file={imaginaryFile}
            onFileChange={setImaginaryFile}
            disabled={isRunning}
          />
        </>
      ) : (
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
      )}

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
