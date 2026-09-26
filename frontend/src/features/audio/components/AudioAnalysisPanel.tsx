import { Activity, BarChart3, Radio } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ACCEPT_AUDIO } from '@/lib/accept'
import { analyzeAudio } from '@/services/audioService'
import type { AudioAnalysisResult, TransformBackend } from '@/services/types'

function Sparkline({ values, colorClass = 'bg-audio' }: { values: number[]; colorClass?: string }) {
  const max = Math.max(...values.map(Math.abs), 1e-9)
  return <div className="flex h-40 items-center gap-px overflow-hidden rounded border bg-muted/20 px-1">{values.map((v, i) => <span key={i} className={`w-full min-w-px ${colorClass}`} style={{ height: `${Math.max(2, Math.abs(v) / max * 48)}%`, opacity: 0.35 + Math.min(Math.abs(v) / max, 1) * 0.65 }} />)}</div>
}

function Spectrogram({ rows }: { rows: number[][] }) {
  return <div className="overflow-hidden rounded border bg-black/90 p-1"><div className="grid h-40 grid-rows-[repeat(48,minmax(0,1fr))]">{rows.slice(0, 48).map((row, i) => <div key={i} className="flex">{row.slice(0, 96).map((v, j) => <span key={j} className="flex-1" style={{ opacity: 0.12 + v * 0.88, background: 'currentColor' }} />)}</div>)}</div></div>
}

export function AudioAnalysisPanel({ backend }: { backend: TransformBackend }) {
  const [file, setFile] = useState<File | null>(null)
  const [frameSize, setFrameSize] = useState('1024')
  const [result, setResult] = useState<AudioAnalysisResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = useCallback(async () => {
    if (!file) return
    setBusy(true); setError('')
    const response = await analyzeAudio({ input: file, frameSize: Number(frameSize), backend })
    if (response.status === 'ok') setResult(response.data)
    else setError(response.message)
    setBusy(false)
  }, [backend, file, frameSize])

  return <div className="flex flex-col gap-5">
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="size-4" />Audio Fourier laboratory</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-[1fr_220px]">
      <FileDropzone label="Audio source" kind="audio" accept={ACCEPT_AUDIO} tone="audio" file={file} onFileChange={setFile} disabled={busy} />
      <div className="flex flex-col gap-2"><Label>Analysis frame</Label><Select value={frameSize} onValueChange={setFrameSize}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[256,512,1024,2048,4096].map(n=><SelectItem key={n} value={String(n)}>{n} samples</SelectItem>)}</SelectContent></Select><Button variant="audio" disabled={!file || busy} onClick={run}>{busy ? 'Analysing…' : 'Analyse audio'}</Button></div>
    </CardContent></Card>
    {error && <p className="text-sm text-destructive">{error}</p>}
    {result && <>
      <div className="grid gap-3 sm:grid-cols-4">{[['Duration', `${result.duration_seconds.toFixed(2)} s`],['Sample rate', `${result.sample_rate} Hz`],['RMS', result.rms.toFixed(4)],['Peak', result.peak.toFixed(4)]].map(([a,b])=><Card key={a}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{a}</p><p className="mt-1 text-lg font-semibold">{b}</p></CardContent></Card>)}</div>
      <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Radio className="size-4" />Waveform</CardTitle></CardHeader><CardContent><Sparkline values={result.waveform} /></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><BarChart3 className="size-4" />Magnitude spectrum</CardTitle></CardHeader><CardContent><Sparkline values={result.spectrum.magnitude} colorClass="bg-foreground" /><p className="mt-2 text-xs text-muted-foreground">Log-scaled magnitude, normalized for display.</p></CardContent></Card></div>
      <Card><CardHeader><CardTitle className="text-sm">Spectrogram</CardTitle></CardHeader><CardContent><Spectrogram rows={result.spectrogram} /><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>Time →</span><span>Low → high frequency ↑</span></div></CardContent></Card>
    </>}
  </div>
}
