import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CheckCircle2, Download, FileJson, FileText, History, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { RunResult } from './UnifiedExperimentRunner'

const STORAGE_KEY = 'phaseforge-experiment-history-v1'
const MAX_RUNS = 30

type StoredRun = RunResult & { id: string }

function readHistory(): StoredRun[] {
  try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as StoredRun[]; return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}
function saveHistory(runs: StoredRun[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_RUNS))) }
function download(name: string, content: string, type: string) { const a=document.createElement('a'); const u=URL.createObjectURL(new Blob([content],{type})); a.href=u; a.download=name; a.click(); URL.revokeObjectURL(u) }
function csv(runs: StoredRun[]) { const rows=[['id','domain','created_at','metric','value']]; runs.forEach(r=>Object.entries(r.metrics).forEach(([k,v])=>rows.push([r.id,r.kind,r.createdAt,k,String(v)]))); return rows.map(r=>r.map(v=>`"${v.replaceAll('"','""')}"`).join(',')).join('\n') }
function report(runs: StoredRun[]) { return ['PHASEFORGE EXPERIMENT REPORT','==========================','',`Experiments recorded: ${runs.length}`,'',runs.map((r,i)=>[`Experiment ${i+1}`,`ID: ${r.id}`,`Domain: ${r.kind}`,`Created: ${r.createdAt}`,...Object.entries(r.metrics).map(([k,v])=>`  ${k}: ${v}`),''].join('\n')).join('\n')] .join('\n') }

export function ExperimentHistory({ latest }: { latest: RunResult | null }) {
  const [runs,setRuns]=useState<StoredRun[]>([])
  useEffect(()=>setRuns(readHistory()),[])
  useEffect(()=>{ if(!latest) return; const item:StoredRun={...latest,id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`}; setRuns(current=>{const next=[item,...current].slice(0,MAX_RUNS); try{saveHistory(next)}catch{} return next}) },[latest])
  const summary=useMemo(()=>({image:runs.filter(r=>r.kind==='image').length,audio:runs.filter(r=>r.kind==='audio').length}),[runs])
  const clear=()=>{setRuns([]); localStorage.removeItem(STORAGE_KEY)}
  return <Card>
    <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><History className="size-5"/>Experiment history</CardTitle><CardDescription>Persistent browser-local records for reproducibility and side-by-side review. Up to {MAX_RUNS} runs are retained.</CardDescription></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!runs.length} onClick={()=>download('phaseforge-experiments.csv',csv(runs),'text/csv')}><Download/>CSV</Button><Button variant="outline" size="sm" disabled={!runs.length} onClick={()=>download('phaseforge-experiments.json',JSON.stringify(runs,null,2),'application/json')}><FileJson/>JSON</Button><Button variant="outline" size="sm" disabled={!runs.length} onClick={()=>download('phaseforge-experiment-report.txt',report(runs),'text/plain')}><FileText/>Report</Button><Button variant="ghost" size="sm" disabled={!runs.length} onClick={clear}><Trash2/>Clear</Button></div></div></CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">Total runs</p><p className="mt-1 text-2xl font-semibold tabular">{runs.length}</p></div><div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">Image experiments</p><p className="mt-1 text-2xl font-semibold tabular">{summary.image}</p></div><div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">Audio experiments</p><p className="mt-1 text-2xl font-semibold tabular">{summary.audio}</p></div></div>
      {!runs.length ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"><BarChart3 className="mx-auto mb-2 size-5"/>Run a unified experiment to create the first reproducible record.</div> : <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="p-3">Domain</th><th className="p-3">Created</th><th className="p-3">Key metric</th><th className="p-3">Stages</th></tr></thead><tbody>{runs.map(r=>{const entries=Object.entries(r.metrics); const key=entries.find(([k])=>/psnr|snr|entropy|correlation/i.test(k)) ?? entries[0]; return <tr key={r.id} className="border-t"><td className="p-3 font-medium uppercase">{r.kind}</td><td className="p-3 text-muted-foreground">{r.createdAt}</td><td className="p-3">{key ? <><span className="text-muted-foreground">{key[0]}:</span> <span className="font-semibold tabular">{String(key[1])}</span></> : '—'}</td><td className="p-3"><span className="inline-flex items-center gap-1 text-xs"><CheckCircle2 className="size-3"/>{r.stages.filter(s=>s.status==='done').length}/{r.stages.length}</span></td></tr>})}</tbody></table></div>}
    </CardContent>
  </Card>
}
