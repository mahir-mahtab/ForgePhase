import { KeyRound, Play, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ACCEPT_AUDIO } from '@/lib/accept'
import { audioSecurityReport } from '@/services/audioService'
import type { AudioSecurityReport, TransformBackend } from '@/services/types'

function fmt(v: number, digits = 3) { return Number.isFinite(v) ? v.toFixed(digits) : '∞' }

function LineChart({ report }: { report: AudioSecurityReport }) {
  const points = report.key_sensitivity
  const width = 760, height = 280, pad = 42
  const max = Math.max(...points.map(p => p.snr_db), 1)
  const min = Math.min(...points.map(p => p.snr_db), -20)
  const span = Math.max(max - min, 1)
  const coords = points.map((p, i) => {
    const x = pad + i / Math.max(points.length - 1, 1) * (width - pad * 2)
    const y = height - pad - ((p.snr_db - min) / span) * (height - pad * 2)
    return `${x},${y}`
  }).join(' ')
  return <div className="overflow-x-auto rounded-lg border bg-muted/20 p-3">
    <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[640px]" role="img" aria-label="SNR versus phase key error">
      <line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad} stroke="currentColor" strokeOpacity=".25" />
      <line x1={pad} y1={pad} x2={pad} y2={height-pad} stroke="currentColor" strokeOpacity=".25" />
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth="3" className="text-audio" />
      {points.map((p,i) => { const x=pad+i/Math.max(points.length-1,1)*(width-pad*2); const y=height-pad-((p.snr_db-min)/span)*(height-pad*2); return <circle key={p.phase_error_rad} cx={x} cy={y} r="4" className="fill-audio" /> })}
      <text x={width/2} y={height-8} textAnchor="middle" className="fill-current text-[11px]">Phase error (radians)</text>
      <text x="13" y={height/2} textAnchor="middle" transform={`rotate(-90 13 ${height/2})`} className="fill-current text-[11px]">SNR (dB)</text>
    </svg>
  </div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular">{value}</p></div>
}

export function AudioSecurityPanel({ backend }: { backend: TransformBackend }) {
  const [original, setOriginal] = useState<File | null>(null)
  const [ciphertext, setCiphertext] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [wrongPassphrase, setWrongPassphrase] = useState('different-key')
  const [maxError, setMaxError] = useState('1')
  const [steps, setSteps] = useState('9')
  const [report, setReport] = useState<AudioSecurityReport | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const canRun = !!original && !!ciphertext && !!passphrase && !!wrongPassphrase && !running
  const last = useMemo(() => report?.key_sensitivity.at(-1), [report])

  async function run() {
    if (!original || !ciphertext || !passphrase || !wrongPassphrase) return
    setRunning(true); setError('')
    try {
      const phase = Number(maxError), count = Number(steps)
      if (!(phase >= 0 && phase <= Math.PI) || !Number.isInteger(count) || count < 3 || count > 21) throw new Error('Use a phase error from 0 to π and between 3 and 21 samples.')
      const result = await audioSecurityReport({ original, ciphertext, passphrase, wrongPassphrase, maxPhaseError: phase, steps: count, backend })
      if (result.status === 'ok') setReport(result.data); else setError(result.message)
    } catch (e) { setError(e instanceof Error ? e.message : 'Security analysis failed.') }
    finally { setRunning(false) }
  }

  return <div className="flex flex-col gap-6">
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-5 text-audio" />Audio DRPE security laboratory</CardTitle><CardDescription>Compare the original waveform against correct-key and wrong-key recovery, then measure how reconstruction quality changes under controlled phase-key error.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <FileDropzone label="Original audio" kind="audio" accept={ACCEPT_AUDIO} tone="audio" file={original} onFileChange={setOriginal} disabled={running} />
        <FileDropzone label="Ciphertext (.npz)" kind="audio" accept=".npz,application/octet-stream" tone="audio" file={ciphertext} onFileChange={setCiphertext} disabled={running} />
        <PassphraseField value={passphrase} onChange={setPassphrase} disabled={running} label="Correct passphrase" />
        <label className="flex flex-col gap-2 text-sm"><span>Wrong passphrase</span><Input value={wrongPassphrase} disabled={running} onChange={e => setWrongPassphrase(e.target.value)} /></label>
        <label className="flex flex-col gap-2 text-sm"><span>Maximum phase error (rad)</span><Input type="number" min="0" max={Math.PI} step="0.05" value={maxError} disabled={running} onChange={e => setMaxError(e.target.value)} /></label>
        <label className="flex flex-col gap-2 text-sm"><span>Sensitivity samples</span><Input type="number" min="3" max="21" step="1" value={steps} disabled={running} onChange={e => setSteps(e.target.value)} /></label>
        <div className="md:col-span-2"><Button variant="audio" size="lg" className="w-full" disabled={!canRun} onClick={run}><Play />{running ? 'Running security experiment…' : 'Run audio security experiment'}</Button></div>
      </CardContent>
    </Card>
    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
    {report && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Correct-key SNR" value={`${fmt(report.correct_key.snr_db,2)} dB`} /><Metric label="Wrong-key SNR" value={`${fmt(report.wrong_key.snr_db,2)} dB`} /><Metric label="Correct correlation" value={fmt(report.correct_key.correlation,4)} /><Metric label="Wrong correlation" value={fmt(report.wrong_key.correlation,4)} /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Duration" value={`${fmt(report.duration_seconds,2)} s`} /><Metric label="Sample rate" value={`${report.sample_rate} Hz`} /><Metric label="Block size" value={`${report.block_size}`} /><Metric label="Channels" value={`${report.channels}`} /></div>
      <Card><CardHeader><CardTitle><ShieldCheck className="mr-2 inline size-4 text-audio" />Correct key vs wrong key</CardTitle><CardDescription>The same ciphertext is decrypted twice. A different passphrase should not reconstruct the original waveform.</CardDescription></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-2"><div className="rounded-lg border p-4"><p className="font-medium">Correct key</p><p className="mt-2 text-sm text-muted-foreground">MSE {fmt(report.correct_key.mse,6)} · SNR {fmt(report.correct_key.snr_db,2)} dB · Segmental SNR {fmt(report.correct_key.segmental_snr_db,2)} dB</p></div><div className="rounded-lg border p-4"><p className="font-medium">Wrong key</p><p className="mt-2 text-sm text-muted-foreground">MSE {fmt(report.wrong_key.mse,6)} · SNR {fmt(report.wrong_key.snr_db,2)} dB · Segmental SNR {fmt(report.wrong_key.segmental_snr_db,2)} dB</p></div></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Audio key sensitivity</CardTitle><CardDescription>SNR response to a progressively perturbed phase mask. Final point: {fmt(last?.key_error_percent ?? 0,0)}% of π.</CardDescription></CardHeader><CardContent><LineChart report={report} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Experiment data</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Error</th><th className="p-2">SNR</th><th className="p-2">Segmental SNR</th><th className="p-2">Correlation</th><th className="p-2">MSE</th></tr></thead><tbody>{report.key_sensitivity.map(p => <tr key={p.phase_error_rad} className="border-b border-border/60"><td className="p-2 font-mono">{fmt(p.phase_error_rad,3)}</td><td className="p-2 font-mono">{fmt(p.snr_db,2)} dB</td><td className="p-2 font-mono">{fmt(p.segmental_snr_db,2)} dB</td><td className="p-2 font-mono">{fmt(p.correlation,4)}</td><td className="p-2 font-mono">{fmt(p.mse,6)}</td></tr>)}</tbody></table></div></CardContent></Card>
    </>}
  </div>
}
