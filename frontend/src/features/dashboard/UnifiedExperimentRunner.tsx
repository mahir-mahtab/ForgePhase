import { useMemo, useState } from 'react'
import { Activity, Download, FlaskConical, ImageIcon, Play, ShieldCheck, Volume2 } from 'lucide-react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ACCEPT_AUDIO, ACCEPT_IMAGE } from '@/lib/accept'
import { audioRobustnessReport, audioSecurityReport, decryptAudio, encryptAudio } from '@/services/audioService'
import { imageKeySensitivityReport, encryptImage, decryptImage, imageRobustnessReport } from '@/services/imageService'
import { imageSecurityReport } from '@/services/imageReportService'
import type { TransformBackend } from '@/services/types'

interface RunnerProps { backend: TransformBackend; onComplete?: (result: RunResult) => void }

type Stage = { name: string; status: 'pending' | 'running' | 'done' | 'failed'; detail: string }
export type RunResult = { kind: 'image' | 'audio'; createdAt: string; metrics: Record<string, string | number>; stages: Stage[] }

async function fileFromUrl(url: string, name: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Could not read ${name} from the backend.`)
  const blob = await response.blob()
  return new File([blob], name, { type: blob.type || 'application/octet-stream' })
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function fmt(value: unknown, digits = 3) {
  if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(digits) : '∞'
  return String(value ?? '—')
}

function StageList({ stages }: { stages: Stage[] }) {
  return <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    {stages.map((stage) => <div key={stage.name} className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{stage.name}</span><span className="font-mono text-[10px] uppercase text-muted-foreground">{stage.status}</span></div>
      <p className="mt-1 text-xs text-muted-foreground">{stage.detail}</p>
    </div>)}
  </div>
}

export function UnifiedExperimentRunner({ backend, onComplete }: RunnerProps) {
  const [kind, setKind] = useState<'image' | 'audio'>('image')
  const [image, setImage] = useState<File | null>(null)
  const [audio, setAudio] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [wrongPassphrase, setWrongPassphrase] = useState('different-key')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<RunResult | null>(null)
  const [stages, setStages] = useState<Stage[]>([])

  const source = kind === 'image' ? image : audio
  const canRun = !!source && passphrase.length > 0 && !running
  const exportText = useMemo(() => {
    if (!result) return ''
    const lines = ['PHASEFORGE UNIFIED EXPERIMENT', `Domain: ${result.kind}`, `Created: ${result.createdAt}`, '']
    for (const [key, value] of Object.entries(result.metrics)) lines.push(`${key}: ${value}`)
    lines.push('', 'Stages:')
    for (const stage of result.stages) lines.push(`- ${stage.name}: ${stage.status} — ${stage.detail}`)
    return lines.join('\n')
  }, [result])

  async function runImage(input: File) {
    const next: Stage[] = [
      { name: 'DRPE encryption', status: 'running', detail: 'Generating two ciphertext components.' },
      { name: 'Correct-key recovery', status: 'pending', detail: 'Waiting for ciphertext.' },
      { name: 'Wrong-key recovery', status: 'pending', detail: 'Waiting for ciphertext.' },
      { name: 'Security analysis', status: 'pending', detail: 'Waiting for reconstructions.' },
    ]
    setStages(next)
    const encrypted = await encryptImage({ input, passphrase, greyscale: false, backend })
    if (encrypted.status !== 'ok') throw new Error(encrypted.message)
    next[0] = { ...next[0], status: 'done', detail: 'Real + imaginary cipher pair created.' }
    next[1] = { ...next[1], status: 'running' }
    setStages([...next])
    const real = await fileFromUrl(encrypted.data.real.url ?? '', 'cipher-real.png')
    const imaginary = await fileFromUrl(encrypted.data.imaginary.url ?? '', 'cipher-imaginary.png')
    const restored = await decryptImage({ realFile: real, imaginaryFile: imaginary, passphrase, backend })
    if (restored.status !== 'ok') throw new Error(restored.message)
    const restoredFile = await fileFromUrl(restored.data.artifact.url ?? '', 'restored.png')
    next[1] = { ...next[1], status: 'done', detail: 'Original key reconstructed the image.' }
    next[2] = { ...next[2], status: 'running' }
    setStages([...next])
    const wrong = await decryptImage({ realFile: real, imaginaryFile: imaginary, passphrase: wrongPassphrase || 'different-key', backend })
    if (wrong.status !== 'ok') throw new Error(wrong.message)
    const wrongFile = await fileFromUrl(wrong.data.artifact.url ?? '', 'wrong-key.png')
    next[2] = { ...next[2], status: 'done', detail: 'Different key reconstruction generated.' }
    next[3] = { ...next[3], status: 'running' }
    setStages([...next])
    const [report, sensitivity, robustness] = await Promise.all([
      imageSecurityReport({ original: input, restored: restoredFile, realFile: real, imaginaryFile: imaginary, wrongKey: wrongFile, backend }),
      imageKeySensitivityReport({ original: input, realFile: real, imaginaryFile: imaginary, passphrase, maxPhaseError: Math.PI, steps: 9,backend }),
      imageRobustnessReport({ original: input, realFile: real, imaginaryFile: imaginary, passphrase, level: 0.1, profile: 'all', backend }),
    ])
    next[3] = { ...next[3], status: 'done', detail: `${robustness.status === 'ok' ? robustness.data.rows.length : 0} attack cases + key sensitivity.` }
    setStages([...next])
    return { kind: 'image' as const, createdAt: new Date().toLocaleString(), metrics: {
      'Plaintext entropy': report.original.entropy, 'Cipher entropy': report.ciphertext.entropy,
      'NPCR (%)': report.ciphertext.npcr_percent, 'UACI (%)': report.ciphertext.uaci_percent,
      'Correct-key PSNR (dB)': report.reconstruction.psnr_db, 'Correct-key correlation': report.reconstruction.correlation,
      'Wrong-key PSNR (dB)': report.wrong_key?.psnr_db ?? '—', 'Wrong-key correlation': report.wrong_key?.correlation ?? '—',
      'Key sensitivity points':sensitivity.status === 'ok'? sensitivity.data.points.length: 0, 'Attack cases': robustness.status === 'ok' ? robustness.data.rows.length : 0,
    }, stages: next }
  }

  async function runAudio(input: File) {
    const next: Stage[] = [
      { name: 'DRPE encryption', status: 'running', detail: 'Creating block-based audio ciphertext.' },
      { name: 'Correct-key recovery', status: 'pending', detail: 'Waiting for ciphertext.' },
      { name: 'Security analysis', status: 'pending', detail: 'Waiting for recovery.' },
      { name: 'Robustness analysis', status: 'pending', detail: 'Waiting for ciphertext.' },
    ]
    setStages(next)
    const encrypted = await encryptAudio({ input, passphrase, blockSize: 4096, backend })
    if (encrypted.status !== 'ok') throw new Error(encrypted.message)
    next[0] = { ...next[0], status: 'done', detail: 'NPZ ciphertext container created.' }
    next[1] = { ...next[1], status: 'running' }
    setStages([...next])
    const cipher = await fileFromUrl(encrypted.data.artifact.url ?? '', 'cipher.npz')
    const restored = await decryptAudio({ container: cipher, passphrase, backend })
    if (restored.status !== 'ok') throw new Error(restored.message)
    next[1] = { ...next[1], status: 'done', detail: 'Original key reconstructed the waveform.' }
    next[2] = { ...next[2], status: 'running' }
    setStages([...next])
    const security = await audioSecurityReport({ original: input, ciphertext: cipher, passphrase, wrongPassphrase: wrongPassphrase || 'different-key', maxPhaseError: Math.PI, steps: 9, backend })
    if (security.status !== 'ok') throw new Error(security.message)
    next[2] = { ...next[2], status: 'done', detail: 'Correct/wrong key and phase sensitivity measured.' }
    next[3] = { ...next[3], status: 'running' }
    setStages([...next])
    const robustness = await audioRobustnessReport({ original: input, ciphertext: cipher, passphrase, level: 0.1, profile: 'all', backend })
    if (robustness.status !== 'ok') throw new Error(robustness.message)
    next[3] = { ...next[3], status: 'done', detail: `${robustness.data.rows.length} attack cases evaluated.` }
    setStages([...next])
    return { kind: 'audio' as const, createdAt: new Date().toLocaleString(), metrics: {
      'Sample rate (Hz)': security.data.sample_rate, 'Duration (s)': security.data.duration_seconds,
      'Correct-key SNR (dB)': security.data.correct_key.snr_db, 'Wrong-key SNR (dB)': security.data.wrong_key.snr_db,
      'Correct correlation': security.data.correct_key.correlation, 'Wrong correlation': security.data.wrong_key.correlation,
      'Key sensitivity points': security.data.key_sensitivity.length, 'Attack cases': robustness.data.rows.length,
    }, stages: next }
  }

  async function run() {
    if (!source) return
    setRunning(true); setError(''); setResult(null)
    try {
      const finished = kind === 'image' ? await runImage(source) : await runAudio(source)
      setResult(finished)
      onComplete?.(finished)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unified experiment failed.'
      setError(message)
      setStages((current) => current.map(stage => stage.status === 'running' ? { ...stage, status: 'failed', detail: message } : stage))
    } finally { setRunning(false) }
  }

  return <section className="flex flex-col gap-5">
    <div className="flex items-end justify-between gap-4">
      <div><p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground">EXPERIMENT ORCHESTRATOR</p><h3 className="type-heading mt-1 text-xl">Run a complete security experiment</h3><p className="mt-1 max-w-3xl text-sm text-muted-foreground">One control surface runs encryption, recovery, security metrics, key sensitivity, and robustness so your final demonstration produces a reproducible experiment record.</p></div>
      <FlaskConical className="hidden size-6 text-muted-foreground sm:block" />
    </div>
    <Card>
      <CardHeader><CardTitle>Unified experiment runner</CardTitle><CardDescription>Choose an input domain, provide the secret, and let the laboratory execute the complete chain.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <Tabs value={kind} onValueChange={(value) => setKind(value as 'image' | 'audio')}>
          <TabsList><TabsTrigger value="image"><ImageIcon /> Image</TabsTrigger><TabsTrigger value="audio"><Volume2 /> Audio</TabsTrigger></TabsList>
          <TabsContent value="image"><FileDropzone label="Image input" kind="image" accept={ACCEPT_IMAGE} tone="image" file={image} onFileChange={setImage} disabled={running} /></TabsContent>
          <TabsContent value="audio"><FileDropzone label="Audio input" kind="audio" accept={ACCEPT_AUDIO} tone="audio" file={audio} onFileChange={setAudio} disabled={running} /></TabsContent>
        </Tabs>
        <div className="grid gap-4 md:grid-cols-2">
          <PassphraseField value={passphrase} onChange={setPassphrase} disabled={running} label="Experiment passphrase" />
          <label className="flex flex-col gap-2 text-sm"><span>Wrong-key passphrase</span><Input value={wrongPassphrase} onChange={e => setWrongPassphrase(e.target.value)} disabled={running} /></label>
        </div>
        <Button className="w-full" size="lg" variant={kind === 'image' ? 'image' : 'audio'} disabled={!canRun} onClick={run}><Play />{running ? 'Running complete experiment…' : 'Run complete experiment'}</Button>
      </CardContent>
    </Card>
    {stages.length > 0 && <StageList stages={stages} />}
    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
    {result && <Card>
      <CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5" />Experiment complete</CardTitle><CardDescription>{result.kind.toUpperCase()} · {result.createdAt}</CardDescription></div><Button variant="outline" onClick={() => downloadText(`phaseforge-${result.kind}-experiment.txt`, exportText)}><Download /> Export results</Button></div></CardHeader>
      <CardContent className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(result.metrics).map(([key, value]) => <div key={key} className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{key}</p><p className="mt-1 text-lg font-semibold tabular">{fmt(value, 4)}</p></div>)}</div><div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground"><Activity className="mr-2 inline size-4" />The experiment record is generated from the actual backend outputs; no metric values are hardcoded.</div></CardContent>
    </Card>}
  </section>
}
