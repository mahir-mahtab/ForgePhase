import { useState } from 'react'
import { BookOpen, Check, ChevronDown, ChevronRight, FileCheck2, FlaskConical, GitBranch, ImageIcon, KeyRound, Mic2, Play, ShieldCheck, SlidersHorizontal, Sparkles, Waves } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { DomainKind } from '@/services/types'

interface LearningCenterProps { onSectionChange: (section: DomainKind) => void }

type Preset = { id: string; title: string; domain: DomainKind; description: string; steps: string[]; icon: typeof ImageIcon }

const PRESETS: Preset[] = [
  { id: 'image-drpe', title: 'Image DRPE Demo', domain: 'image', description: 'Follow the complete encryption → ciphertext → correct-key recovery workflow.', steps: ['Load an image', 'Generate two random phase keys', 'Inspect ciphertext and Fourier spectrum', 'Decrypt with the matching key'], icon: ImageIcon },
  { id: 'wrong-key', title: 'Wrong-Key Sensitivity', domain: 'image', description: 'Study how small phase-key errors change reconstruction quality.', steps: ['Run an image experiment', 'Open Key Sensitivity', 'Sweep phase error from 0 to π', 'Compare MSE, PSNR and correlation'], icon: KeyRound },
  { id: 'attacks', title: 'Robustness Lab', domain: 'image', description: 'Apply controlled attacks and measure how the reconstructed signal changes.', steps: ['Encrypt an image', 'Select an attack profile', 'Adjust attack strength', 'Compare error and quality metrics'], icon: ShieldCheck },
  { id: 'frequency', title: 'Frequency Playground', domain: 'image', description: 'See how filters selectively remove or preserve Fourier components.', steps: ['Open Frequency Playground', 'Choose low/high/band-pass', 'Change cutoff and filter type', 'Inspect spectrum and reconstruction'], icon: SlidersHorizontal },
  { id: 'watermark', title: 'Watermark Demo', domain: 'image', description: 'Embed a watermark in the frequency domain and quantify its visual impact.', steps: ['Open Watermark Lab', 'Choose strength and spectral position', 'Embed and inspect', 'Extract and measure correlation'], icon: Sparkles },
  { id: 'audio', title: 'Audio DRPE Demo', domain: 'audio', description: 'Run block-based Fourier experiments on a WAV signal.', steps: ['Load a WAV file', 'Inspect waveform and spectrum', 'Encrypt and decrypt', 'Measure SNR and correlation'], icon: Waves },
]

const METHODOLOGY = [
  ['01', 'Input', 'An image or audio signal is represented numerically so spatial/time-domain samples can be transformed.'],
  ['02', 'First phase mask', 'A random phase mask multiplies the signal, changing phase information without changing the mask magnitude.'],
  ['03', 'Fourier transform', 'The signal is moved to the frequency domain, where amplitude and phase describe spectral content.'],
  ['04', 'Second phase mask', 'A second independent random phase mask is applied before inverse transformation produces a noise-like ciphertext.'],
  ['05', 'Recovery', 'The matching key pair reverses the phase operations and Fourier transform to reconstruct the signal.'],
]

const METRICS = [
  ['Entropy', 'Measures uncertainty/distribution spread in an image or ciphertext.'],
  ['NPCR / UACI', 'Quantify ciphertext change under small plaintext changes.'],
  ['Correlation', 'Compares statistical similarity between original, cipher and recovered signals.'],
  ['MSE / PSNR', 'Measure reconstruction error and signal quality.'],
  ['SNR / segmental SNR', 'Audio quality measures comparing recovered and reference waveforms.'],
]

function LearningCenter({ onSectionChange }: LearningCenterProps) {
  const [openPreset, setOpenPreset] = useState<string>('image-drpe')
  const [tab, setTab] = useState<'presets' | 'method' | 'architecture'>('presets')

  return <section className="flex flex-col gap-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground">LEARNING / PRESENTATION CENTER</p><h3 className="type-heading mt-1 text-xl">Explain the experiment, not just the result</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Use the guided presets for a live demonstration, then use the methodology and architecture views to explain what each stage is doing.</p></div>
      <Badge variant="notice"><BookOpen /> Guided laboratory</Badge>
    </div>

    <div className="flex flex-wrap gap-2">
      <Button variant={tab === 'presets' ? 'default' : 'outline'} onClick={() => setTab('presets')}><Play /> Guided presets</Button>
      <Button variant={tab === 'method' ? 'default' : 'outline'} onClick={() => setTab('method')}><FlaskConical /> Methodology</Button>
      <Button variant={tab === 'architecture' ? 'default' : 'outline'} onClick={() => setTab('architecture')}><GitBranch /> Architecture</Button>
    </div>

    {tab === 'presets' && <div className="grid gap-3 lg:grid-cols-2">
      {PRESETS.map((preset) => { const Icon = preset.icon; const open = openPreset === preset.id; return <Card key={preset.id} className={open ? 'border-foreground/20' : ''}>
        <CardHeader className="pb-3"><button className="flex w-full items-start gap-3 text-left" onClick={() => setOpenPreset(open ? '' : preset.id)}><div className="rounded-md border bg-muted p-2"><Icon className="size-4" /></div><div className="min-w-0 flex-1"><CardTitle className="text-base">{preset.title}</CardTitle><CardDescription className="mt-1">{preset.description}</CardDescription></div>{open ? <ChevronDown className="mt-1 size-4" /> : <ChevronRight className="mt-1 size-4" />}</button></CardHeader>
        {open && <CardContent className="pt-0"><div className="space-y-2 border-l pl-4">{preset.steps.map((step, i) => <div key={step} className="flex gap-3 text-sm"><span className="font-mono text-xs text-muted-foreground">0{i + 1}</span><span>{step}</span></div>)}</div><Button className="mt-5" variant={preset.domain === 'image' ? 'image' : 'audio'} onClick={() => onSectionChange(preset.domain)}>Open {preset.domain === 'image' ? 'Image' : 'Audio'} Lab <Play /></Button></CardContent>}
      </Card> })}
    </div>}

    {tab === 'method' && <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <Card><CardHeader><CardTitle>DRPE methodology</CardTitle><CardDescription>A compact explanation suitable for a project demonstration or viva.</CardDescription></CardHeader><CardContent className="space-y-3">{METHODOLOGY.map(([num, title, detail]) => <div key={num} className="grid grid-cols-[2rem_9rem_1fr] gap-3 rounded-md border p-3 text-sm"><span className="font-mono text-xs text-muted-foreground">{num}</span><span className="font-semibold">{title}</span><span className="leading-6 text-muted-foreground">{detail}</span></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>What the metrics mean</CardTitle><CardDescription>Use these definitions when presenting your results.</CardDescription></CardHeader><CardContent className="space-y-3">{METRICS.map(([title, detail]) => <div key={title} className="rounded-md border p-3"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>)}</CardContent></Card>
    </div>}

    {tab === 'architecture' && <Card><CardHeader><CardTitle>ForgePhase system architecture</CardTitle><CardDescription>How the user interface, API and signal-processing layers connect.</CardDescription></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-3"><Arch title="React / Vite" icon={ImageIcon} items={['Dashboard and experiment runner', 'Image and audio workspaces', 'Metrics, history and exports']} /><Arch title="FastAPI" icon={GitBranch} items={['Image / audio routes', 'Security and attack reports', 'Artifact and analysis endpoints']} /><Arch title="Signal engine" icon={Mic2} items={['Custom Fourier transforms', 'DRPE image and audio pipelines', 'Filtering, watermarking and metrics']} /></div><div className="my-4 flex justify-center"><div className="rounded-full border bg-muted px-4 py-2 text-xs font-mono">UI → API → TRANSFORM / ANALYSIS → ARTIFACTS → UI</div></div><div className="grid gap-3 md:grid-cols-2"><CheckItem text="Experiment history stores metrics, not passphrases or source/ciphertext bytes." /><CheckItem text="Exports create human-readable experiment records for reproducibility." /><CheckItem text="Image and audio workflows share the same experiment philosophy." /><CheckItem text="The dashboard exposes the processing stages instead of hiding them." /></div></CardContent></Card>}
  </section>
}

function Arch({ title, icon: Icon, items }: { title: string; icon: typeof ImageIcon; items: string[] }) { return <div className="rounded-lg border p-4"><div className="flex items-center gap-2 font-semibold"><Icon className="size-4" />{title}</div><ul className="mt-4 space-y-2">{items.map(item => <li key={item} className="text-xs leading-5 text-muted-foreground">• {item}</li>)}</ul></div> }
function CheckItem({ text }: { text: string }) { return <div className="flex gap-2 rounded-md border p-3 text-xs text-muted-foreground"><FileCheck2 className="size-4 shrink-0" />{text}</div> }

export default LearningCenter
