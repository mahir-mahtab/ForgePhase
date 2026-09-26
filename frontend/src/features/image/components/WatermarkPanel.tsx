import { Activity, ScanSearch, ShieldCheck, Stamp } from 'lucide-react'
import { useCallback, useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { OperationShell } from '@/components/shared/OperationShell'
import { ParamSlider } from '@/components/shared/ParamSlider'
import { ResultPanel } from '@/components/shared/ResultPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOperation } from '@/hooks/useOperation'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { IMAGE_DEFAULTS, analyzeWatermark, embedWatermark, extractWatermark } from '@/services/imageService'
import type { TransformBackend, WatermarkAnalysis } from '@/services/types'

const metric = (value: number | string, digits = 4) => typeof value === 'number' ? value.toFixed(digits) : value

function AnalysisCards({ report }: { report: WatermarkAnalysis }) {
  const cards = [
    ['Imperceptibility', `${metric(report.visibility.psnr_db, 2)} dB`, 'Higher PSNR means a smaller visible change.'],
    ['Pixel correlation', metric(report.visibility.correlation, 4), 'Similarity between carrier and marked image.'],
    ['Mean pixel change', metric(report.visibility.mean_pixel_change, 6), 'Average absolute spatial-domain change.'],
    ['Spectrum change', metric(report.spectrum.mean_magnitude_change, 6), 'Average magnitude change in the Fourier domain.'],
  ]
  if (report.extraction) cards.push(['Extraction correlation', metric(report.extraction.correlation, 4), 'Similarity between the supplied and recovered watermark.'])
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([title, value, help]) => <Card key={title}><CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle><CardDescription>{help}</CardDescription></CardHeader><CardContent><p className="font-mono text-xl tabular">{value}</p></CardContent></Card>)}</div>
}

function EmbedPanel({ backend, onCompleted }: { backend: TransformBackend; onCompleted: (original: File, marked: File, watermark: File, strength: number, position: number) => void }) {
  const [input, setInput] = useState<File | null>(null)
  const [watermark, setWatermark] = useState<File | null>(null)
  const [strength, setStrength] = useState(IMAGE_DEFAULTS.watermarkStrength)
  const [position, setPosition] = useState(IMAGE_DEFAULTS.watermarkPosition)
  const { state, execute, reset } = useOperation(embedWatermark)
  const isRunning = state.phase === 'running'
  const canRun = !!input && !!watermark
  const handleRun = useCallback(() => { if (input && watermark) void execute({ input, watermark, strength, position, backend }).then((result) => { if (result?.status === 'ok' && result.data.artifact.url) { fetch(result.data.artifact.url).then(r => r.blob()).then(b => onCompleted(input, new File([b], 'watermarked.png', { type: 'image/png' }), watermark, strength, position)).catch(() => undefined) } }) }, [backend, execute, input, onCompleted, position, strength, watermark])
  return <OperationShell tone="image" icon={<Stamp className="size-4" />} title="Embed watermark" description="Place a grayscale mark in a controlled mid-frequency region. Strength trades invisibility for robustness; position controls the spectral radius." command="watermark-embed" runLabel="Embed watermark" canRun={canRun} blockedReason="Pick a carrier image and watermark" isRunning={isRunning} hasResult={state.phase !== 'idle'} onRun={handleRun} onReset={reset} result={<ResultPanel state={state} tone="image" idleHint="The marked image will appear here." cliCommand="phaseforge watermark-embed <carrier> <watermark> marked.png" />}>
    <FileDropzone label="Carrier image" kind="image" accept={ACCEPT_IMAGE} tone="image" file={input} onFileChange={setInput} disabled={isRunning} />
    <FileDropzone label="Watermark" hint="read as greyscale" kind="image" accept={ACCEPT_IMAGE} tone="image" file={watermark} onFileChange={setWatermark} disabled={isRunning} />
    <ParamSlider label="Strength" description="Higher values make the watermark easier to recover but increase image change." value={strength} min={0.01} max={1} step={0.01} disabled={isRunning} onChange={setStrength} />
    <ParamSlider label="Spectral position" description="Move the mark from lower to higher spatial frequencies." value={position} min={0.05} max={0.45} step={0.01} disabled={isRunning} onChange={setPosition} />
  </OperationShell>
}

function ExtractPanel({ backend }: { backend: TransformBackend }) {
  const [original, setOriginal] = useState<File | null>(null)
  const [marked, setMarked] = useState<File | null>(null)
  const [height, setHeight] = useState('64')
  const [width, setWidth] = useState('64')
  const [strength, setStrength] = useState(IMAGE_DEFAULTS.watermarkStrength)
  const [position, setPosition] = useState(IMAGE_DEFAULTS.watermarkPosition)
  const { state, execute, reset } = useOperation(extractWatermark)
  const h = Number.parseInt(height, 10), w = Number.parseInt(width, 10)
  const canRun = !!original && !!marked && Number.isInteger(h) && h > 0 && Number.isInteger(w) && w > 0
  const isRunning = state.phase === 'running'
  const handleRun = useCallback(() => { if (original && marked && canRun) void execute({ original, marked, height: h, width: w, strength, position, backend }) }, [backend, canRun, execute, h, marked, original, position, strength, w])
  return <OperationShell tone="image" icon={<ScanSearch className="size-4" />} title="Extract watermark" description="Recover the mark by comparing the original and marked spectra. This implementation is non-blind: the carrier is required." command="watermark-extract" runLabel="Extract watermark" canRun={canRun} blockedReason="Pick both images and enter valid watermark dimensions" isRunning={isRunning} hasResult={state.phase !== 'idle'} onRun={handleRun} onReset={reset} result={<ResultPanel state={state} tone="image" idleHint="The recovered watermark appears here." cliCommand="phaseforge watermark-extract <original> <marked> extracted.png" />}>
    <FileDropzone label="Original image" kind="image" accept={ACCEPT_IMAGE} tone="image" file={original} onFileChange={setOriginal} disabled={isRunning} />
    <FileDropzone label="Marked image" kind="image" accept={ACCEPT_IMAGE} tone="image" file={marked} onFileChange={setMarked} disabled={isRunning} />
    <div className="grid grid-cols-2 gap-3"><div className="flex flex-col gap-2"><Label htmlFor="watermark-height">Height</Label><Input id="watermark-height" inputMode="numeric" value={height} onChange={e => setHeight(e.target.value)} /></div><div className="flex flex-col gap-2"><Label htmlFor="watermark-width">Width</Label><Input id="watermark-width" inputMode="numeric" value={width} onChange={e => setWidth(e.target.value)} /></div></div>
    <ParamSlider label="Strength" description="Use the same value used during embedding." value={strength} min={0.01} max={1} step={0.01} disabled={isRunning} onChange={setStrength} />
    <ParamSlider label="Spectral position" description="Use the same position used during embedding." value={position} min={0.05} max={0.45} step={0.01} disabled={isRunning} onChange={setPosition} />
  </OperationShell>
}

export function WatermarkPanel({ backend }: { backend: TransformBackend }) {
  const [experiment, setExperiment] = useState<{ original: File; marked: File; watermark: File; strength: number; position: number } | null>(null)
  const [report, setReport] = useState<WatermarkAnalysis | null>(null)
  const [analysisState, setAnalysisState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const runAnalysis = async () => {
    if (!experiment) return
    setAnalysisState('running')
    const result = await analyzeWatermark({ ...experiment, backend })
    if (result.status === 'ok') { setReport(result.data); setAnalysisState('done') } else setAnalysisState('error')
  }
  return <div className="flex flex-col gap-6">
    <Card><CardHeader><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-image" /><CardTitle>Watermark laboratory</CardTitle></div><CardDescription>Run an embedding experiment, then quantify how much the carrier changed and how accurately the watermark survives in the frequency domain.</CardDescription></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-3"><div><p className="text-xs text-muted-foreground">1 · Embed</p><p className="text-sm">Choose carrier, mark, strength and spectral position.</p></div><div><p className="text-xs text-muted-foreground">2 · Inspect</p><p className="text-sm">Compare spatial and Fourier-domain changes.</p></div><div><p className="text-xs text-muted-foreground">3 · Measure</p><p className="text-sm">Use PSNR, correlation and extraction quality.</p></div></div></CardContent></Card>
    <EmbedPanel backend={backend} onCompleted={(original, marked, watermark, strength, position) => { setExperiment({ original, marked, watermark, strength, position }); setReport(null); setAnalysisState('idle') }} />
    <ExtractPanel backend={backend} />
    {experiment ? <Card><CardHeader><div className="flex items-center gap-2"><Activity className="size-5" /><CardTitle>Experiment analysis</CardTitle></div><CardDescription>Metrics are calculated against the original carrier. The supplied watermark is also used to verify extraction quality.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><Button onClick={() => void runAnalysis()} disabled={analysisState === 'running'}>{analysisState === 'running' ? 'Analyzing…' : 'Analyze this experiment'}</Button>{analysisState === 'error' ? <p className="text-sm text-destructive">Analysis failed. Check that the images and watermark dimensions are valid.</p> : null}{report ? <AnalysisCards report={report} /> : null}</CardContent></Card> : null}
  </div>
}
