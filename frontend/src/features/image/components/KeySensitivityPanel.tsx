import { KeyRound, Play, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { imageKeySensitivityReport, type KeySensitivityReport } from '@/services/imageReportService'

function fmt(value: number, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : '∞'
}

function LineChart({ report }: { report: KeySensitivityReport }) {
  const points = report.points
  const width = 720
  const height = 260
  const pad = 42
  const maxMse = Math.max(...points.map((p) => p.mse), 1e-9)
  const coords = points.map((p, i) => {
    const x = pad + (i / Math.max(points.length - 1, 1)) * (width - pad * 2)
    const y = pad + (p.mse / maxMse) * (height - pad * 2)
    return `${x},${height - y}`
  }).join(' ')
  return <div className="overflow-x-auto rounded-lg border border-border bg-muted/20 p-3">
    <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px]" role="img" aria-label="MSE versus phase-key error">
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="currentColor" strokeOpacity=".25" />
      <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="currentColor" strokeOpacity=".25" />
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth="3" className="text-image" />
      {points.map((p, i) => {
        const x = pad + (i / Math.max(points.length - 1, 1)) * (width - pad * 2)
        const y = height - (pad + (p.mse / maxMse) * (height - pad * 2))
        return <circle key={p.phase_error_rad} cx={x} cy={y} r="4" className="fill-image" />
      })}
      <text x={width / 2} y={height - 8} textAnchor="middle" className="fill-current text-[11px]">Phase error (radians)</text>
      <text x="13" y={height / 2} textAnchor="middle" transform={`rotate(-90 13 ${height / 2})`} className="fill-current text-[11px]">MSE</text>
    </svg>
  </div>
}

export function KeySensitivityPanel() {
  const [original, setOriginal] = useState<File | null>(null)
  const [realFile, setRealFile] = useState<File | null>(null)
  const [imaginaryFile, setImaginaryFile] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [maxError, setMaxError] = useState('1')
  const [steps, setSteps] = useState('9')
  const [report, setReport] = useState<KeySensitivityReport | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const canRun = !!original && !!realFile && !!imaginaryFile && passphrase.length > 0 && !running
  const endpointSummary = useMemo(() => report?.points.at(-1), [report])

  async function run() {
    if (!original || !realFile || !imaginaryFile || !passphrase) return
    setRunning(true); setError('')
    try {
      const phase = Number(maxError); const count = Number(steps)
      if (!(phase > 0 && phase <= Math.PI) || !Number.isInteger(count) || count < 3 || count > 21) {
        throw new Error('Use a maximum phase error from 0 to π and between 3 and 21 samples.')
      }
      setReport(await imageKeySensitivityReport({ original, realFile, imaginaryFile, passphrase, maxPhaseError: phase, steps: count }))
    } catch (e) { setError(e instanceof Error ? e.message : 'Sensitivity analysis failed.') }
    finally { setRunning(false) }
  }

  return <div className="flex flex-col gap-6">
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2"><KeyRound className="size-5 text-image" /><CardTitle>Wrong-key sensitivity laboratory</CardTitle></div>
        <CardDescription>Keep the ciphertext fixed and introduce a controlled phase error into both secret masks. This measures how quickly reconstruction quality collapses as the key becomes wrong.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <FileDropzone label="Original image" kind="image" accept={ACCEPT_IMAGE} tone="image" file={original} onFileChange={setOriginal} disabled={running} />
        <FileDropzone label="Cipher real component" kind="image" accept={ACCEPT_IMAGE} tone="image" file={realFile} onFileChange={setRealFile} disabled={running} />
        <FileDropzone label="Cipher imaginary component" kind="image" accept={ACCEPT_IMAGE} tone="image" file={imaginaryFile} onFileChange={setImaginaryFile} disabled={running} />
        <PassphraseField value={passphrase} onChange={setPassphrase} disabled={running} label="Correct passphrase" hint="The backend uses this only to derive the reference masks; the controlled phase error creates the wrong-key experiment." />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2 text-sm"><span>Maximum phase error (rad)</span><Input type="number" min="0.01" max={Math.PI} step="0.05" value={maxError} disabled={running} onChange={(e) => setMaxError(e.target.value)} /></label>
          <label className="flex flex-col gap-2 text-sm"><span>Samples</span><Input type="number" min="3" max="21" step="1" value={steps} disabled={running} onChange={(e) => setSteps(e.target.value)} /></label>
        </div>
        <div className="flex items-end"><Button variant="image" size="lg" className="w-full" disabled={!canRun} onClick={run}><Play />{running ? 'Running experiment…' : 'Run sensitivity experiment'}</Button></div>
      </CardContent>
    </Card>
    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
    {report && <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Perfect key MSE" value={fmt(report.points[0].mse, 6)} />
      <Metric label="Perfect key PSNR" value={`${fmt(report.points[0].psnr_db, 2)} dB`} />
      <Metric label="Final correlation" value={fmt(endpointSummary?.correlation ?? 0, 4)} />
      <Metric label="Final error" value={`${fmt((endpointSummary?.key_error_percent ?? 0), 0)}%`} />
    </div><LineChart report={report} />
    <Card><CardHeader><CardTitle><ShieldAlert className="mr-2 inline size-4 text-image" />Experiment data</CardTitle><CardDescription>Each row is a fresh decryption using the same ciphertext and a progressively perturbed pair of phase masks.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Error</th><th className="p-2">MSE</th><th className="p-2">PSNR</th><th className="p-2">Correlation</th></tr></thead><tbody>{report.points.map((p) => <tr key={p.phase_error_rad} className="border-b border-border/60"><td className="p-2 font-mono">{fmt(p.phase_error_rad, 3)} rad</td><td className="p-2 font-mono">{fmt(p.mse, 5)}</td><td className="p-2 font-mono">{fmt(p.psnr_db, 2)} dB</td><td className="p-2 font-mono">{fmt(p.correlation, 4)}</td></tr>)}</tbody></table></div></CardContent></Card></>}
  </div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular">{value}</p></div>
}
