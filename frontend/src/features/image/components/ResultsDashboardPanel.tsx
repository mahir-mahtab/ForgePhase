import { BarChart3, Download, Gauge, KeyRound, LineChart, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { imageKeySensitivityReport, imageSecurityReport, type ImageReport, type KeySensitivityReport } from '@/services/imageReportService'
import type { TransformBackend } from '@/services/types'

function fmt(value: number, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : '∞'
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-lg border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular">{value}</p>{detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}</div>
}

function ComparisonBars({ report }: { report: ImageReport }) {
  const rows = [
    ['MSE', report.reconstruction.mse, report.wrong_key?.mse ?? null],
    ['Correlation', Math.abs(report.reconstruction.correlation), report.wrong_key ? Math.abs(report.wrong_key.correlation) : null],
    ['Mean error', report.reconstruction.difference_mean, report.wrong_key?.difference_mean ?? null],
  ] as const
  return <Card><CardHeader><CardTitle>Correct key vs different key</CardTitle><CardDescription>Side-by-side normalized bars make the sensitivity experiment easy to present.</CardDescription></CardHeader><CardContent className="space-y-5">{rows.map(([label, correct, wrong]) => { const max = Math.max(correct, wrong ?? 0, 1e-12); return <div key={label}><div className="mb-2 flex justify-between text-xs"><span>{label}</span><span className="font-mono tabular">{fmt(correct, 5)} {wrong !== null ? ` / ${fmt(wrong, 5)}` : ''}</span></div><div className="space-y-1"><div className="flex items-center gap-2"><span className="w-16 text-[10px] text-muted-foreground">correct</span><div className="h-2 flex-1 rounded-full bg-muted"><div className="h-full rounded-full bg-image" style={{ width: `${Math.min(100, correct / max * 100)}%` }} /></div></div>{wrong !== null ? <div className="flex items-center gap-2"><span className="w-16 text-[10px] text-muted-foreground">different</span><div className="h-2 flex-1 rounded-full bg-muted"><div className="h-full rounded-full bg-warning" style={{ width: `${Math.min(100, wrong / max * 100)}%` }} /></div></div> : null}</div></div> })}</CardContent></Card>
}

function SensitivityChart({ report }: { report: KeySensitivityReport }) {
  const width = 720; const height = 260; const pad = 34
  const maxMse = Math.max(...report.points.map(p => p.mse), 1e-12)
  const points = report.points.map((p, i) => `${pad + (i / Math.max(1, report.points.length - 1)) * (width - pad * 2)},${height - pad - (p.mse / maxMse) * (height - pad * 2)}`).join(' ')
  return <Card><CardHeader><div className="flex items-center gap-2"><LineChart className="size-5 text-image" /><CardTitle>Key-error response curve</CardTitle></div><CardDescription>MSE as phase-key error increases. Each point is one controlled decryption experiment.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px] w-full" role="img" aria-label="MSE versus phase key error chart"><line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad} stroke="currentColor" className="text-border" /><line x1={pad} y1={pad} x2={pad} y2={height-pad} stroke="currentColor" className="text-border" /><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" className="text-image" />{report.points.map((p, i) => { const x = pad + (i / Math.max(1, report.points.length - 1)) * (width - pad * 2); const y = height - pad - (p.mse / maxMse) * (height - pad * 2); return <circle key={i} cx={x} cy={y} r="4" className="fill-image"><title>{`${p.key_error_percent.toFixed(0)}% key error: MSE ${p.mse.toFixed(5)}`}</title></circle> })}<text x={width/2} y={height-6} textAnchor="middle" className="fill-muted-foreground text-[11px]">phase-key error (%)</text><text x="12" y={height/2} textAnchor="middle" transform={`rotate(-90 12 ${height/2})`} className="fill-muted-foreground text-[11px]">MSE</text></svg></div></CardContent></Card>
}

export function ResultsDashboardPanel({ backend }: { backend: TransformBackend }) {
  const [original, setOriginal] = useState<File | null>(null)
  const [restored, setRestored] = useState<File | null>(null)
  const [realFile, setRealFile] = useState<File | null>(null)
  const [imaginaryFile, setImaginaryFile] = useState<File | null>(null)
  const [wrongKey, setWrongKey] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [report, setReport] = useState<ImageReport | null>(null)
  const [sensitivity, setSensitivity] = useState<KeySensitivityReport | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const canRun = !!original && !!restored && !!realFile && !!imaginaryFile && !running
  const run = async () => {
    if (!original || !restored || !realFile || !imaginaryFile) return
    setRunning(true); setError('')
    try {
      const [security, curve] = await Promise.all([
        imageSecurityReport({ original, restored, realFile, imaginaryFile, wrongKey, backend }),
        passphrase ? imageKeySensitivityReport({ original, realFile, imaginaryFile, passphrase, maxPhaseError: Math.PI, steps: 9 }) : Promise.resolve(null),
      ])
      setReport(security); setSensitivity(curve)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not build the experiment dashboard.') }
    finally { setRunning(false) }
  }

  const exportText = useMemo(() => {
    if (!report) return ''
    const lines = ['PhaseForge experimental results', '', `Dimensions: ${report.dimensions.width} × ${report.dimensions.height}`, `Plaintext entropy: ${report.original.entropy}`, `Cipher entropy: ${report.ciphertext.entropy}`, `NPCR (%): ${report.ciphertext.npcr_percent}`, `UACI (%): ${report.ciphertext.uaci_percent}`, `Correct-key MSE: ${report.reconstruction.mse}`, `Correct-key PSNR (dB): ${report.reconstruction.psnr_db}`, `Correct-key correlation: ${report.reconstruction.correlation}`, `Correct-key MAE: ${report.reconstruction.difference_mean}`]
    if (report.wrong_key) lines.push(`Different-key MSE: ${report.wrong_key.mse}`, `Different-key PSNR (dB): ${report.wrong_key.psnr_db}`, `Different-key correlation: ${report.wrong_key.correlation}`, `Different-key MAE: ${report.wrong_key.difference_mean}`)
    if (sensitivity) lines.push('', 'Key sensitivity curve:', ...sensitivity.points.map(p => `${p.key_error_percent.toFixed(1)}%, MSE=${p.mse}, PSNR=${p.psnr_db}, correlation=${p.correlation}`))
    return lines.join('\n')
  }, [report, sensitivity])

  const download = () => { if (!exportText) return; const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'phaseforge-experiment-results.txt'; a.click(); URL.revokeObjectURL(url) }

  return <div className="flex flex-col gap-6">
    <Card><CardHeader><div className="flex items-center gap-2"><BarChart3 className="size-5 text-image" /><CardTitle>Experimental results dashboard</CardTitle></div><CardDescription>Assemble one DRPE run into a presentation-ready results page. The dashboard combines security metrics, reconstruction quality, and controlled key sensitivity.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
      <FileDropzone label="Original image" kind="image" accept={ACCEPT_IMAGE} tone="image" file={original} onFileChange={setOriginal} disabled={running} />
      <FileDropzone label="Correct-key restored image" kind="image" accept={ACCEPT_IMAGE} tone="image" file={restored} onFileChange={setRestored} disabled={running} />
      <FileDropzone label="Cipher real component" kind="image" accept={ACCEPT_IMAGE} tone="image" file={realFile} onFileChange={setRealFile} disabled={running} />
      <FileDropzone label="Cipher imaginary component" kind="image" accept={ACCEPT_IMAGE} tone="image" file={imaginaryFile} onFileChange={setImaginaryFile} disabled={running} />
      <FileDropzone label="Optional different-key result" kind="image" accept={ACCEPT_IMAGE} tone="image" file={wrongKey} onFileChange={setWrongKey} disabled={running} />
      <div className="flex flex-col justify-end gap-3"><label className="text-sm font-medium">Passphrase for key-sensitivity curve</label><input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="Optional — enables 0→π experiment" disabled={running} className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /><Button variant="image" size="lg" disabled={!canRun} onClick={() => void run()}><ShieldCheck />{running ? 'Building dashboard…' : 'Build experiment dashboard'}</Button></div>
    </CardContent></Card>

    {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
    {report ? <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Plaintext entropy" value={`${fmt(report.original.entropy)} bits`} /><Metric label="Cipher entropy" value={`${fmt(report.ciphertext.entropy)} bits`} /><Metric label="NPCR" value={`${fmt(report.ciphertext.npcr_percent, 2)}%`} /><Metric label="UACI" value={`${fmt(report.ciphertext.uaci_percent, 2)}%`} /></div>
      <Card><CardHeader><div className="flex items-center gap-2"><Gauge className="size-5 text-image" /><CardTitle>Reconstruction quality</CardTitle></div><CardDescription>Quality metrics for the restored image, with an optional different-key comparison.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="MSE" value={fmt(report.reconstruction.mse, 6)} /><Metric label="PSNR" value={`${fmt(report.reconstruction.psnr_db, 2)} dB`} /><Metric label="Correlation" value={fmt(report.reconstruction.correlation, 5)} /><Metric label="Mean absolute error" value={fmt(report.reconstruction.difference_mean, 6)} /></CardContent></Card>
      <ComparisonBars report={report} />
      {sensitivity ? <SensitivityChart report={sensitivity} /> : <Card><CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground"><KeyRound className="size-5" />Enter the correct passphrase above to add the controlled key-error curve.</CardContent></Card>}
      <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="font-medium">Export experiment summary</p><p className="text-xs text-muted-foreground">Save the current metrics and key-sensitivity points as a plain-text lab record.</p></div><Button variant="outline" onClick={download}><Download /> Export results</Button></CardContent></Card>
    </> : null}
  </div>
}
