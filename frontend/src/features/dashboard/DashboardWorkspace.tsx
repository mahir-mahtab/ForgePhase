import {
  Activity,
  AudioLines,
  CheckCircle2,
  CircleDot,
  Clock3,
  Cpu,
  ImageIcon,
  KeyRound,
  LockKeyhole,
  MoveRight,
  Radar,
  ShieldCheck,
  Sparkles,
  Waves,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { RunResult } from '@/features/dashboard/UnifiedExperimentRunner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { DomainKind, TransformBackend } from '@/services/types'
import { UnifiedExperimentRunner } from '@/features/dashboard/UnifiedExperimentRunner'
import { ExperimentHistory } from '@/features/dashboard/ExperimentHistory'
import LearningCenter from '@/features/dashboard/LearningCenter'
import PresentationMode from '@/features/dashboard/PresentationMode'

interface DashboardWorkspaceProps {
  onSectionChange: (section: DomainKind) => void
  backend: TransformBackend
}

type Health = 'checking' | 'online' | 'offline'

const PIPELINE = [
  { label: 'Plaintext', icon: ImageIcon, detail: 'Spatial-domain input' },
  { label: 'Phase key #1', icon: KeyRound, detail: 'Random phase multiplication' },
  { label: '2D Fourier transform', icon: Radar, detail: 'Move into frequency domain' },
  { label: 'Phase key #2', icon: LockKeyhole, detail: 'Second random phase' },
  { label: 'Ciphertext', icon: ShieldCheck, detail: 'Noise-like encrypted output' },
]

function DashboardWorkspace({ onSectionChange, backend }: DashboardWorkspaceProps) {
  const [health, setHealth] = useState<Health>('checking')
  const [version, setVersion] = useState<string>('—')
  const [checkedAt, setCheckedAt] = useState<string>('')
  const [latestExperiment, setLatestExperiment] = useState<RunResult | null>(null)

  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const response = await fetch('/health')
        if (!response.ok) throw new Error('health check failed')
        const data = (await response.json()) as { version?: string }
        if (!alive) return
        setHealth('online')
        setVersion(data.version ?? 'connected')
        setCheckedAt(new Date().toLocaleTimeString())
      } catch {
        if (!alive) return
        setHealth('offline')
        setVersion('—')
        setCheckedAt(new Date().toLocaleTimeString())
      }
    }
    void check()
    const timer = window.setInterval(check, 15000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  const healthLabel = health === 'online' ? 'Backend online' : health === 'offline' ? 'Backend offline' : 'Checking backend'
  const healthVariant = health === 'online' ? 'success' : health === 'offline' ? 'warning' : 'notice'

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-6 lg:grid-cols-[1.45fr_0.55fr]">
        <Card className="overflow-hidden border-foreground/15">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="notice"><Sparkles /> Fourier security laboratory</Badge>
              <Badge variant={healthVariant}>{health === 'online' ? <CheckCircle2 /> : <CircleDot />} {healthLabel}</Badge>
            </div>
            <h2 className="type-display mt-5 max-w-4xl text-4xl sm:text-5xl">
              Forge the signal. Transform the phase. Measure what survives.
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
              A visual laboratory for Double Random Phase Encoding, Fourier-domain image
              analysis, and audio experiments. Every result is designed to make the signal
              processing visible rather than hiding it behind a button.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button variant="image" size="lg" onClick={() => onSectionChange('image')}>
                <ImageIcon /> Open Image Lab <MoveRight />
              </Button>
              <Button variant="audio" size="lg" onClick={() => onSectionChange('audio')}>
                <AudioLines /> Open Audio Lab <MoveRight />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>System pulse</CardTitle>
              <Activity className="size-4 text-muted-foreground" />
            </div>
            <CardDescription>Live connection and project state.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border bg-muted p-3">
                <p className="text-xs text-muted-foreground">API</p>
                <p className="mt-1 tabular text-lg font-semibold">{version}</p>
              </div>
              <div className="rounded-md border border-border bg-muted p-3">
                <p className="text-xs text-muted-foreground">Checked</p>
                <p className="mt-1 tabular text-lg font-semibold">{checkedAt || '—'}</p>
              </div>
            </div>
            <div className="rounded-md border border-border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Cpu className="size-4" /> Transform engine
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose NumPy or the custom transform backend from the header when running an operation.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <UnifiedExperimentRunner backend={backend} onComplete={setLatestExperiment} />
      <ExperimentHistory latest={latestExperiment} />

      <LearningCenter onSectionChange={onSectionChange} />

      <PresentationMode />

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground">DRPE / CORE PIPELINE</p>
            <h3 className="type-heading mt-1 text-xl">What happens to the signal</h3>
          </div>
          <Badge variant="outline">5 stages</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          {PIPELINE.map((stage, index) => {
            const Icon = stage.icon
            return (
              <Card key={stage.label} className="relative">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <p className="mt-7 text-sm font-semibold">{stage.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{stage.detail}</p>
                </CardContent>
                {index < PIPELINE.length - 1 && (
                  <MoveRight className="absolute -right-3 top-1/2 z-10 hidden size-5 -translate-y-1/2 text-muted-foreground md:block" />
                )}
              </Card>
            )
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Zap} label="Transform" value="2D CFT" detail="Spatial ↔ frequency" />
        <MetricCard icon={ShieldCheck} label="Security" value="2 keys" detail="Independent random phase masks" />
        <MetricCard icon={Waves} label="Audio" value="1D blocks" detail="DRPE experiments for WAV signals" />
        <MetricCard icon={Clock3} label="Analysis" value="Live" detail="Measure quality after every run" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Next experiments</CardTitle>
          <CardDescription>A guided path through the laboratory.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Experiment number="01" title="Encrypt an image" description="Create a ciphertext pair and inspect the Fourier spectrum." action="Open Image Lab" onClick={() => onSectionChange('image')} />
          <Experiment number="02" title="Break the wrong key" description="Compare correct and perturbed-key reconstructions with quantitative metrics." action="Open Image Lab" onClick={() => onSectionChange('image')} />
          <Experiment number="03" title="Explore audio" description="Encrypt, decrypt, denoise, enhance, and test robustness of a WAV signal." action="Open Audio Lab" onClick={() => onSectionChange('audio')} />
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof Zap; label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <Icon className="size-4 text-muted-foreground" />
        <p className="mt-5 text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}

function Experiment({ number, title, description, action, onClick }: { number: string; title: string; description: string; action: string; onClick: () => void }) {
  return (
    <div className="rounded-md border border-border p-4">
      <span className="font-mono text-xs text-muted-foreground">{number}</span>
      <h4 className="mt-4 text-sm font-semibold">{title}</h4>
      <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">{description}</p>
      <Button className="mt-4" variant="outline" size="sm" onClick={onClick}>{action} <MoveRight /></Button>
    </div>
  )
}

export default DashboardWorkspace
