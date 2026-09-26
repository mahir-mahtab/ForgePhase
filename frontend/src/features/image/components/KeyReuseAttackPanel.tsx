import { useCallback, useState } from 'react'

import { OperationShell } from '@/components/shared/OperationShell'
import { ReportState } from '@/components/shared/ReportState'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { Label } from '@/components/ui/label'
import { useOperation } from '@/hooks/useOperation'
import { cliCommand } from '@/lib/cli'
import { formatMetric } from '@/lib/format'
import { runKeyReuseDemo } from '@/services/imageService'
import type { KeyReuseDemoResult } from '@/services/types'

const SIZES = [
  { value: '32', label: '32 px' },
  { value: '64', label: '64 px' },
  { value: '128', label: '128 px' },
] as const

type Size = (typeof SIZES)[number]['value']

function KeyReuseResult({ result }: { result: KeyReuseDemoResult }) {
  const panels = [
    { key: 'secret', label: 'Secret image', src: result.images.secret },
    { key: 'ciphertext', label: 'Ciphertext (magnitude)', src: result.images.ciphertext },
    { key: 'recovered', label: 'Recovered by attacker', src: result.images.recovered },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {panels.map((panel) => (
          <figure key={panel.key} className="m-0 flex flex-col gap-1.5">
            <img
              src={panel.src}
              alt={panel.label}
              className="aspect-square w-full rounded-md border border-border bg-plate object-contain [image-rendering:pixelated]"
            />
            <figcaption className="text-xs text-muted-foreground">{panel.label}</figcaption>
          </figure>
        ))}
      </div>
      <dl className="grid grid-cols-3 gap-3 border-t border-border pt-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Encryptions used</dt>
          <dd className="tabular">{result.probesUsed}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Correlation</dt>
          <dd className="tabular">{formatMetric(result.correlation)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Max pixel error</dt>
          <dd className="tabular">{formatMetric(result.maxAbsoluteError)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function KeyReuseAttackPanel() {
  const [size, setSize] = useState<Size>('64')
  const { state, execute, reset } = useOperation(runKeyReuseDemo)
  const isRunning = state.phase === 'running'

  const handleRun = useCallback(() => {
    void execute({ size: Number(size) })
  }, [execute, size])

  return (
    <OperationShell
      title="Key-reuse attack"
      description="Recovers the masks from two chosen images, then decrypts anything."
      runLabel="Run attack"
      canRun
      isRunning={isRunning}
      hasResult={state.phase !== 'idle'}
      onRun={handleRun}
      onReset={reset}
      command={cliCommand('phaseforge', 'key-reuse-demo', '--size', size)}
      result={
        <ReportState
          state={state}
          idleHint="The secret test image, its ciphertext, and what the attacker recovers."
          render={(result) => <KeyReuseResult result={result} />}
        />
      }
    >
      <div className="flex flex-col gap-1.5">
        <Label>Test image size</Label>
        <SegmentedControl
          label="Test image size"
          value={size}
          options={SIZES}
          onChange={setSize}
          disabled={isRunning}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Each file gets a fresh salt, so masks never repeat.
      </p>
    </OperationShell>
  )
}
