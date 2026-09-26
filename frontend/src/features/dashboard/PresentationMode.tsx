import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Presentation, ShieldCheck, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const SLIDES = [
  { eyebrow: '01 / PROBLEM', title: 'Why Fourier-domain encryption?', body: 'Images and audio contain structured spatial or temporal information. Fourier analysis separates that structure into frequency components, giving us a useful domain for controlled phase manipulation.', points: ['Signal becomes a numerical array', 'Fourier transform exposes magnitude and phase', 'Phase masks hide the original structure'] },
  { eyebrow: '02 / ALGORITHM', title: 'Double Random Phase Encoding', body: 'DRPE uses two independent random phase masks. The first mask modifies the input before the Fourier transform; the second protects the transformed representation before inverse transformation creates the ciphertext.', points: ['Input × key 1', '2D/1D Fourier transform', 'Frequency representation × key 2', 'Inverse transform → ciphertext'] },
  { eyebrow: '03 / SECURITY', title: 'Measure the experiment', body: 'ForgePhase turns the encryption experiment into measurable evidence rather than a visual-only demo.', points: ['Entropy and correlation for statistical behavior', 'NPCR/UACI for sensitivity to input changes', 'MSE/PSNR/correlation for recovery quality', 'Wrong-key experiments for key sensitivity'] },
  { eyebrow: '04 / ROBUSTNESS', title: 'What happens after an attack?', body: 'Controlled perturbations can be applied to encrypted or processed signals. The resulting metrics help document how reconstruction quality changes as attack strength changes.', points: ['Noise and quantization', 'Blur and occlusion for images', 'Phase jitter', 'Strength-controlled comparisons'] },
  { eyebrow: '05 / REPRODUCIBILITY', title: 'A result you can explain', body: 'Each completed unified experiment can be retained locally as a metric record and exported as CSV, JSON, or a text report. Sensitive passphrases and raw source/ciphertext bytes are not stored in the history.', points: ['Repeat the same workflow', 'Record parameters and metrics', 'Export evidence for a report or viva'] },
]

export default function PresentationMode() {
  const [slide, setSlide] = useState(0)
  const [full, setFull] = useState(false)
  const current = SLIDES[slide]
  const progress = useMemo(() => `${slide + 1} / ${SLIDES.length}`, [slide])

  const move = (delta: number) => setSlide((value) => Math.min(SLIDES.length - 1, Math.max(0, value + delta)))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') move(1)
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'Escape') setFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <section className={full ? 'fixed inset-0 z-50 overflow-auto bg-background p-4 sm:p-8' : ''}>
      <Card className="overflow-hidden border-foreground/15">
        <CardHeader className="border-b bg-muted/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Badge variant="notice"><Presentation /> Presentation mode</Badge><span className="font-mono text-xs text-muted-foreground">{progress}</span></div>
            <Button variant="outline" size="sm" onClick={() => setFull((value) => !value)}>{full ? <Minimize2 /> : <Maximize2 />} {full ? 'Exit' : 'Expand'}</Button>
          </div>
          <p className="mt-4 font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground">{current.eyebrow}</p>
          <CardTitle className="type-heading text-2xl sm:text-3xl">{current.title}</CardTitle>
          <CardDescription className="max-w-3xl text-sm leading-6">{current.body}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_0.8fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            {current.points.map((point, index) => <div key={point} className="rounded-lg border p-4"><span className="font-mono text-xs text-muted-foreground">0{index + 1}</span><p className="mt-3 text-sm font-medium leading-6">{point}</p></div>)}
          </div>
          <div className="flex min-h-48 flex-col justify-between rounded-xl border bg-muted/30 p-5">
            <div><ShieldCheck className="size-5" /><p className="mt-4 text-sm font-semibold">ForgePhase takeaway</p><p className="mt-2 text-xs leading-6 text-muted-foreground">The project connects Fourier mathematics, encryption, experimentation, quantitative analysis, and reproducible reporting in one workflow.</p></div>
            <div className="flex items-center gap-2"><Sparkles className="size-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Use ← / → controls during a demonstration.</span></div>
          </div>
        </CardContent>
        <div className="flex items-center justify-between border-t p-4">
          <Button variant="outline" size="sm" disabled={slide === 0} onClick={() => move(-1)}><ChevronLeft /> Previous</Button>
          <div className="flex gap-1.5">{SLIDES.map((item, index) => <button aria-label={`Go to slide ${index + 1}`} key={item.eyebrow} onClick={() => setSlide(index)} className={`h-2 rounded-full transition-all ${index === slide ? 'w-7 bg-foreground' : 'w-2 bg-muted-foreground/30'}`} />)}</div>
          <Button variant="outline" size="sm" disabled={slide === SLIDES.length - 1} onClick={() => move(1)}>Next <ChevronRight /></Button>
        </div>
      </Card>
    </section>
  )
}
