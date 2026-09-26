import { BarChart3, Flame, Gauge, KeyRound, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { imageSecurityReport, type ImageReport } from '@/services/imageReportService'
import type { TransformBackend } from '@/services/types'

function fmt(value: number, digits = 3) {
  if (!Number.isFinite(value)) return '∞'
  return value.toFixed(digits)
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-lg border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular">{value}</p>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</div>
}

function Histogram({ title, counts }: { title: string; counts: number[] }) {
  const max = Math.max(...counts, 1)
  const step = Math.max(1, Math.ceil(counts.length / 32))
  const bars = counts.filter((_, i) => i % step === 0).map((v, i) => Math.max(2, Math.round((v / max) * 100)))
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>32-bin normalized intensity distribution.</CardDescription></CardHeader><CardContent><div className="flex h-32 items-end gap-1">{bars.map((height, i) => <div key={i} title={`${counts[i * step] ?? 0} pixels`} className="flex-1 rounded-t-sm bg-image/70" style={{ height: `${height}%` }} />)}</div><div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>0</span><span>Intensity</span><span>1</span></div></CardContent></Card>
}

function CorrelationCard({ title, values }: { title: string; values: { horizontal: number; vertical: number; diagonal: number } }) {
  const rows = [['Horizontal', values.horizontal], ['Vertical', values.vertical], ['Diagonal', values.diagonal]] as const
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>Adjacent-pixel correlation; closer to zero indicates weaker local predictability.</CardDescription></CardHeader><CardContent className="space-y-3">{rows.map(([label, value]) => <div key={label}><div className="mb-1 flex justify-between text-xs"><span>{label}</span><span className="font-mono tabular">{fmt(value, 4)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-image" style={{ width: `${Math.min(100, Math.abs(value) * 100)}%` }} /></div></div>)}</CardContent></Card>
}

function Heatmap({ data }: { data: number[][] }) {
  const flat = data.flat(); const max = Math.max(...flat, 1e-12)
  return <Card><CardHeader><CardTitle>Reconstruction difference map</CardTitle><CardDescription>Mean absolute error per spatial tile between original and decrypted image.</CardDescription></CardHeader><CardContent><div className="mx-auto grid aspect-square max-w-[420px] overflow-hidden rounded-md border border-border" style={{ gridTemplateColumns: `repeat(${data[0]?.length ?? 1}, minmax(0, 1fr))` }}>{data.flatMap((row, y) => row.map((v, x) => <div key={`${y}-${x}`} title={v.toFixed(4)} style={{ opacity: Math.min(1, 0.08 + (v / max) * 0.92) }} className="bg-image" />))}</div></CardContent></Card>
}

export function SecurityAnalysisPanel({ backend }: { backend: TransformBackend }) {
  const [original, setOriginal] = useState<File | null>(null)
  const [restored, setRestored] = useState<File | null>(null)
  const [realFile, setRealFile] = useState<File | null>(null)
  const [imaginaryFile, setImaginaryFile] = useState<File | null>(null)
  const [wrongKey, setWrongKey] = useState<File | null>(null)
  const [report, setReport] = useState<ImageReport | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const canRun = !!original && !!restored && !!realFile && !!imaginaryFile && !running
  const run = async () => {
    if (!original || !restored || !realFile || !imaginaryFile) return
    setRunning(true); setError('')
    try { setReport(await imageSecurityReport({ original, restored, realFile, imaginaryFile, wrongKey, backend })) }
    catch (e) { setError(e instanceof Error ? e.message : 'Analysis failed.') }
    finally { setRunning(false) }
  }

  return <div className="flex flex-col gap-6">
    <Card><CardHeader><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-image" /><CardTitle>Image security & reconstruction analysis</CardTitle></div><CardDescription>Load one experiment and quantify what encryption changes and how accurately the correct key reconstructs the plaintext. Optionally add a wrong-key reconstruction.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
      <FileDropzone label="Original image" kind="image" accept={ACCEPT_IMAGE} tone="image" file={original} onFileChange={setOriginal} disabled={running} />
      <FileDropzone label="Correct-key restored image" kind="image" accept={ACCEPT_IMAGE} tone="image" file={restored} onFileChange={setRestored} disabled={running} />
      <FileDropzone label="Cipher real component" kind="image" accept={ACCEPT_IMAGE} tone="image" file={realFile} onFileChange={setRealFile} disabled={running} />
      <FileDropzone label="Cipher imaginary component" kind="image" accept={ACCEPT_IMAGE} tone="image" file={imaginaryFile} onFileChange={setImaginaryFile} disabled={running} />
      <FileDropzone label="Optional wrong-key result" kind="image" accept={ACCEPT_IMAGE} tone="image" file={wrongKey} onFileChange={setWrongKey} disabled={running} />
      <div className="flex items-end"><Button variant="image" size="lg" className="w-full" disabled={!canRun} onClick={run}><BarChart3 /> {running ? 'Analyzing…' : 'Run security analysis'}</Button></div>
    </CardContent></Card>

    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}

    {report && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Plaintext entropy" value={`${fmt(report.original.entropy, 3)} bits`} detail="8-bit scale" />
        <Metric label="Cipher entropy" value={`${fmt(report.ciphertext.entropy, 3)} bits`} detail="8-bit display proxy" />
        <Metric label="NPCR" value={`${fmt(report.ciphertext.npcr_percent, 2)}%`} detail="plaintext vs cipher" />
        <Metric label="UACI" value={`${fmt(report.ciphertext.uaci_percent, 2)}%`} detail="plaintext vs cipher" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Histogram title="Plaintext histogram" counts={report.original.histogram.counts} />
        <Histogram title="Ciphertext histogram" counts={report.ciphertext.histogram.counts} />
        <CorrelationCard title="Plaintext correlation" values={report.original.correlation} />
        <CorrelationCard title="Ciphertext correlation" values={report.ciphertext.correlation} />
      </div>

      <Card><CardHeader><div className="flex items-center gap-2"><Gauge className="size-5 text-image" /><CardTitle>Correct-key reconstruction</CardTitle></div><CardDescription>Pixel-level quality of the recovered image against the original.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-4">
        <Metric label="MSE" value={fmt(report.reconstruction.mse, 6)} />
        <Metric label="PSNR" value={`${fmt(report.reconstruction.psnr_db, 2)} dB`} />
        <Metric label="Correlation" value={fmt(report.reconstruction.correlation, 5)} />
        <Metric label="Mean absolute error" value={fmt(report.reconstruction.difference_mean, 6)} />
      </CardContent></Card>

      {report.wrong_key && <Card><CardHeader><div className="flex items-center gap-2"><KeyRound className="size-5 text-warning" /><CardTitle>Wrong-key comparison</CardTitle></div><CardDescription>The deliberately perturbed-key result is evaluated using the same metrics.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-4"><Metric label="MSE" value={fmt(report.wrong_key.mse, 6)} /><Metric label="PSNR" value={`${fmt(report.wrong_key.psnr_db, 2)} dB`} /><Metric label="Correlation" value={fmt(report.wrong_key.correlation, 5)} /><Metric label="Mean absolute error" value={fmt(report.wrong_key.difference_mean, 6)} /></CardContent></Card>}

      <div className="grid gap-4 md:grid-cols-[1fr_1fr]"><Heatmap data={report.difference_heatmap} /><Card><CardHeader><div className="flex items-center gap-2"><Flame className="size-5 text-image" /><CardTitle>Original spectrum energy</CardTitle></div><CardDescription>Energy distribution across low, middle and high spatial frequencies.</CardDescription></CardHeader><CardContent className="space-y-5">{[['Low', report.frequency_energy.low_percent], ['Mid', report.frequency_energy.mid_percent], ['High', report.frequency_energy.high_percent]].map(([label, value]) => <div key={label as string}><div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="font-mono">{fmt(value as number, 2)}%</span></div><div className="h-3 rounded-full bg-muted"><div className="h-full rounded-full bg-image" style={{ width: `${Math.min(100, value as number)}%` }} /></div></div>)}</CardContent></Card></div>
    </>}
  </div>
}
