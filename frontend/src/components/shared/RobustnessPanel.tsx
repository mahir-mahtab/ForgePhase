import { ShieldAlert } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import type { OperationState } from '@/hooks/useOperation'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_CONTAINER, ACCEPT_IMAGE } from '@/lib/accept'
import { formatMetric, humanizeKey } from '@/lib/format'
import type { AttackReportRequest, ImageAttackReportRequest, RobustnessReport, ServiceResult, TransformBackend } from '@/services/types'

const IMAGE_ATTACKS = ['none', 'gaussian_noise', 'salt_pepper', 'occlusion', 'blur', 'translation', 'phase_jitter', 'quantization']
const AUDIO_ATTACKS = ['none', 'gaussian_noise', 'phase_jitter', 'quantization']
const ICON = <ShieldAlert className="size-4" aria-hidden />

type RobustnessRequest = AttackReportRequest | ImageAttackReportRequest

interface Props<TRequest extends RobustnessRequest> {
  tone: 'image' | 'audio'
  originalAccept: string
  originalKind: 'image' | 'audio'
  originalLabel: string
  run: (request: TRequest) => Promise<ServiceResult<RobustnessReport>>
  backend: TransformBackend
}

function Results({ state, tone }: { state: OperationState<RobustnessReport>; tone: 'image' | 'audio' }) {
  if (state.phase !== 'ok') return null
  const rows = state.data.rows
  if (!rows.length) return null
  const primary = tone === 'image' ? 'psnrDb' : 'snrDb'
  const max = Math.max(...rows.map(r => Number((r.metrics as Record<string, number>)[primary] ?? 0)), 1)
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {rows.slice(0, 4).map(row => {
          const value = Number((row.metrics as Record<string, number>)[primary] ?? 0)
          return (
            <Card key={row.attack}>
              <CardHeader><CardTitle>{humanizeKey(row.attack)}</CardTitle><CardDescription>{primary === 'psnrDb' ? 'PSNR' : 'SNR'}</CardDescription></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{formatMetric(value)} dB</div><Progress value={Math.max(0, Math.min(100, value / max * 100))} /></CardContent>
            </Card>
          )
        })}
      </div>
      <Card>
        <CardHeader><CardTitle>Attack comparison</CardTitle><CardDescription>Decryption quality after each controlled ciphertext attack.</CardDescription></CardHeader>
        <CardContent><div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm"><thead><tr className="bg-muted"><th className="p-3 text-left">Attack</th><th className="p-3 text-right">Level</th><th className="p-3 text-right">MSE</th><th className="p-3 text-right">{primary === 'psnrDb' ? 'PSNR (dB)' : 'SNR (dB)'}</th><th className="p-3 text-right">Correlation</th></tr></thead><tbody>{rows.map(row => { const m = row.metrics as Record<string, number>; return <tr key={row.attack} className="border-t border-border"><td className="p-3 font-medium">{humanizeKey(row.attack)}</td><td className="p-3 text-right font-mono">{Math.round((row.level ?? 0) * 100)}%</td><td className="p-3 text-right font-mono">{formatMetric(Number(m.mse ?? 0))}</td><td className="p-3 text-right font-mono">{formatMetric(Number(m[primary] ?? 0))}</td><td className="p-3 text-right font-mono">{formatMetric(Number(m.correlation ?? 0))}</td></tr> })}</tbody></table></div></CardContent>
      </Card>
    </div>
  )
}

export function RobustnessPanel<TRequest extends RobustnessRequest>({ tone, originalAccept, originalKind, originalLabel, run, backend }: Props<TRequest>) {
  const [ciphertext, setCiphertext] = useState<File | null>(null)
  const [realFile, setRealFile] = useState<File | null>(null)
  const [imaginaryFile, setImaginaryFile] = useState<File | null>(null)
  const [original, setOriginal] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [level, setLevel] = useState(0.10)
  const [selected, setSelected] = useState<string[]>(tone === 'image' ? IMAGE_ATTACKS : AUDIO_ATTACKS)
  const { state, execute, reset } = useOperation(run)
  const attacks = useMemo(() => tone === 'image' ? IMAGE_ATTACKS : AUDIO_ATTACKS, [tone])
  const isRunning = state.phase === 'running'
  const canRun = original !== null && passphrase.length > 0 && (tone === 'image' ? realFile !== null && imaginaryFile !== null : ciphertext !== null)

  const toggle = (name: string) => setSelected(v => v.includes(name) ? v.filter(x => x !== name) : [...v, name])
  const handleRun = useCallback(() => {
    if (!original || !passphrase || !selected.length) return
    const common = { original, passphrase, backend, level, profile: selected.join(',') }
    if (tone === 'image' && realFile && imaginaryFile) void execute({ ...common, realFile, imaginaryFile } as unknown as Omit<TRequest, 'signal'>)
    if (tone === 'audio' && ciphertext) void execute({ ...common, ciphertext } as unknown as Omit<TRequest, 'signal'>)
  }, [backend, ciphertext, execute, imaginaryFile, original, passphrase, realFile, selected, level, tone])

  return <OperationShell tone={tone} icon={ICON} title="Robustness & attack laboratory" description="Corrupt the ciphertext in controlled ways, decrypt with the correct key, and quantify what survives. This demonstrates resilience rather than secrecy." command="attack-report" runLabel="Run attack suite" canRun={canRun && selected.length > 0} blockedReason="Provide the ciphertext, original, passphrase, and at least one attack." isRunning={isRunning} hasResult={state.phase !== 'idle'} onRun={handleRun} onReset={reset} result={<Results state={state} tone={tone} />}>
    {tone === 'image' ? <><FileDropzone label="Real cipher component" hint="cipher-real.png" kind="image" accept={ACCEPT_IMAGE} tone={tone} file={realFile} onFileChange={setRealFile} disabled={isRunning} /><FileDropzone label="Imaginary cipher component" hint="cipher-imaginary.png" kind="image" accept={ACCEPT_IMAGE} tone={tone} file={imaginaryFile} onFileChange={setImaginaryFile} disabled={isRunning} /></> : <FileDropzone label="Ciphertext container" hint=".npz" kind="container" accept={ACCEPT_CONTAINER} tone={tone} file={ciphertext} onFileChange={setCiphertext} disabled={isRunning} />}
    <FileDropzone label={originalLabel} hint="for comparison" kind={originalKind} accept={originalAccept} tone={tone} file={original} onFileChange={setOriginal} disabled={isRunning} />
    <PassphraseField value={passphrase} onChange={setPassphrase} hint="Correct key: we are measuring damage to the ciphertext." disabled={isRunning} />
    <Card><CardHeader><CardTitle>Attack controls</CardTitle><CardDescription>Choose attacks and set their severity.</CardDescription></CardHeader><CardContent className="grid gap-5">
      <div><div className="mb-2 flex justify-between text-sm"><span>Attack strength</span><span className="font-mono">{Math.round(level * 100)}%</span></div><Slider min={0} max={1} step={0.01} value={[level]} onValueChange={v => setLevel(v[0] ?? level)} disabled={isRunning} /></div>
      <div className="flex flex-wrap gap-2">{attacks.map(name => <Button key={name} type="button" variant={selected.includes(name) ? 'default' : 'outline'} size="sm" onClick={() => toggle(name)} disabled={isRunning}>{humanizeKey(name)}</Button>)}</div>
    </CardContent></Card>
  </OperationShell>
}
