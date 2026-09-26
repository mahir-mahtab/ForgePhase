import { BarChart3, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { PassphraseField } from '@/components/shared/PassphraseField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { decryptImage } from '@/services/imageService'
import { imageSecurityReport, type ImageReport } from '@/services/imageReportService'
import type { TransformBackend } from '@/services/types'

function fmt(value: number | string, digits = 3) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n.toFixed(digits) : String(value)
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-lg border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular">{value}</p>{detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}</div>
}

async function artifactToFile(url: string, name: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Could not read the reconstructed image.')
  const blob = await response.blob()
  return new File([blob], name, { type: blob.type || 'image/png' })
}

export function DrpeSecurityLabPanel({ backend }: { backend: TransformBackend }) {
  const [original, setOriginal] = useState<File | null>(null)
  const [realFile, setRealFile] = useState<File | null>(null)
  const [imaginaryFile, setImaginaryFile] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [wrongPassphrase, setWrongPassphrase] = useState('')
  const [correctPreview, setCorrectPreview] = useState('')
  const [wrongPreview, setWrongPreview] = useState('')
  const [report, setReport] = useState<ImageReport | null>(null)
  const [stage, setStage] = useState<'idle' | 'decrypting' | 'analyzing' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  const canRun = !!original && !!realFile && !!imaginaryFile && passphrase.length > 0 && wrongPassphrase.length > 0 && stage !== 'decrypting' && stage !== 'analyzing'

  const run = async () => {
    if (!original || !realFile || !imaginaryFile) return
    setStage('decrypting'); setError(''); setReport(null); setCorrectPreview(''); setWrongPreview('')
    try {
      const [correct, wrong] = await Promise.all([
        decryptImage({ realFile, imaginaryFile, passphrase, backend }),
        decryptImage({ realFile, imaginaryFile, passphrase: wrongPassphrase, backend }),
      ])
      if (correct.status !== 'ok') throw new Error(correct.message)
      if (wrong.status !== 'ok') throw new Error(wrong.message)
      const correctFile = await artifactToFile(correct.data.artifact.url!, 'correct-key-restored.png')
      const wrongFile = await artifactToFile(wrong.data.artifact.url!, 'wrong-key-restored.png')
      setCorrectPreview(correct.data.artifact.url ?? '')
      setWrongPreview(wrong.data.artifact.url ?? '')

      setStage('analyzing')
      const analysis = await imageSecurityReport({ original, restored: correctFile, realFile, imaginaryFile, wrongKey: wrongFile, backend })
      setReport(analysis)
      setStage('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'DRPE security experiment failed.')
      setStage('error')
    }
  }

  return <div className="flex flex-col gap-6">
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-image" /><CardTitle>DRPE security laboratory</CardTitle></div>
        <CardDescription>Run the same ciphertext through the correct key and a deliberately different key, then compare reconstruction quality and security metrics in one experiment.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <FileDropzone label="Original image" kind="image" accept={ACCEPT_IMAGE} tone="image" file={original} onFileChange={setOriginal} disabled={stage === 'decrypting' || stage === 'analyzing'} />
        <FileDropzone label="Cipher real component" kind="image" accept={ACCEPT_IMAGE} tone="image" file={realFile} onFileChange={setRealFile} disabled={stage === 'decrypting' || stage === 'analyzing'} />
        <FileDropzone label="Cipher imaginary component" kind="image" accept={ACCEPT_IMAGE} tone="image" file={imaginaryFile} onFileChange={setImaginaryFile} disabled={stage === 'decrypting' || stage === 'analyzing'} />
        <div className="flex flex-col gap-4"><PassphraseField value={passphrase} onChange={setPassphrase} disabled={stage === 'decrypting' || stage === 'analyzing'} /><PassphraseField value={wrongPassphrase} onChange={setWrongPassphrase} disabled={stage === 'decrypting' || stage === 'analyzing'} /></div>
        <div className="md:col-span-2 flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 size-5 text-image" /><div><p className="text-sm font-medium">Controlled key experiment</p><p className="text-xs text-muted-foreground">The second passphrase should be different from the correct one. The backend has no integrity check, so a wrong key produces an image rather than an error.</p></div></div>
          <Button variant="image" size="lg" disabled={!canRun} onClick={() => void run()}>{stage === 'decrypting' ? 'Decrypting with both keys…' : stage === 'analyzing' ? 'Measuring security…' : 'Run DRPE security experiment'}</Button>
        </div>
      </CardContent>
    </Card>

    {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}

    {(correctPreview || wrongPreview) ? <Card><CardHeader><div className="flex items-center gap-2"><KeyRound className="size-5 text-image" /><CardTitle>Key sensitivity — visual comparison</CardTitle></div><CardDescription>Both reconstructions use the identical ciphertext; only the passphrase changes.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
      {correctPreview ? <div className="space-y-2"><p className="text-sm font-medium">Correct key</p><div className="overflow-hidden rounded-lg border border-border bg-muted/20"><img src={correctPreview} alt="Correct-key reconstruction" className="aspect-video w-full object-contain" /></div></div> : null}
      {wrongPreview ? <div className="space-y-2"><p className="text-sm font-medium">Different key</p><div className="overflow-hidden rounded-lg border border-border bg-muted/20"><img src={wrongPreview} alt="Wrong-key reconstruction" className="aspect-video w-full object-contain" /></div></div> : null}
    </CardContent></Card> : null}

    {report ? <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Plaintext entropy" value={`${fmt(report.original.entropy)} bits`} /><Metric label="Cipher entropy" value={`${fmt(report.ciphertext.entropy)} bits`} /><Metric label="NPCR" value={`${fmt(report.ciphertext.npcr_percent, 2)}%`} /><Metric label="UACI" value={`${fmt(report.ciphertext.uaci_percent, 2)}%`} /></div>
      <Card><CardHeader><div className="flex items-center gap-2"><BarChart3 className="size-5 text-image" /><CardTitle>Reconstruction comparison</CardTitle></div><CardDescription>These metrics quantify how closely each key recovers the original image.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-image/30 bg-image-wash p-4"><p className="mb-3 text-sm font-medium">Correct key</p><div className="grid grid-cols-2 gap-2"><Metric label="MSE" value={fmt(report.reconstruction.mse, 6)} /><Metric label="PSNR" value={`${fmt(report.reconstruction.psnr_db, 2)} dB`} /><Metric label="Correlation" value={fmt(report.reconstruction.correlation, 5)} /><Metric label="MAE" value={fmt(report.reconstruction.difference_mean, 6)} /></div></div>
        {report.wrong_key ? <div className="rounded-lg border border-warning/30 bg-warning/5 p-4"><p className="mb-3 text-sm font-medium">Different key</p><div className="grid grid-cols-2 gap-2"><Metric label="MSE" value={fmt(report.wrong_key.mse, 6)} /><Metric label="PSNR" value={`${fmt(report.wrong_key.psnr_db, 2)} dB`} /><Metric label="Correlation" value={fmt(report.wrong_key.correlation, 5)} /><Metric label="MAE" value={fmt(report.wrong_key.difference_mean, 6)} /></div></div> : null}
      </CardContent></Card>
    </> : null}
  </div>
}
