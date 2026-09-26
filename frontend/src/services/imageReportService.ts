import { API_BASE_URL, AbortedError } from '@/services/client'
import type { TransformBackend } from '@/services/types'

export interface HistogramData { bins: number[]; counts: number[] }
export interface CorrelationData { horizontal: number; vertical: number; diagonal: number }
export interface MetricTriplet { mse: number; psnr_db: number; correlation: number; difference_mean: number }
export interface ImageReport {
  dimensions: { width: number; height: number; channels: number }
  original: { entropy: number; histogram: HistogramData; correlation: CorrelationData }
  ciphertext: { entropy: number; histogram: HistogramData; correlation: CorrelationData; npcr_percent: number; uaci_percent: number }
  reconstruction: MetricTriplet
  difference_heatmap: number[][]
  frequency_energy: { low_percent: number; mid_percent: number; high_percent: number }
  wrong_key?: MetricTriplet
}

export interface ImageReportRequest {
  original: File
  restored: File
  realFile: File
  imaginaryFile: File
  wrongKey?: File | null
  backend: TransformBackend
  signal?: AbortSignal
}

export async function imageSecurityReport(request: ImageReportRequest): Promise<ImageReport> {
  const body = new FormData()
  body.set('original', request.original)
  body.set('restored', request.restored)
  body.set('real_file', request.realFile)
  body.set('imaginary_file', request.imaginaryFile)
  if (request.wrongKey) body.set('wrong_key', request.wrongKey)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/analysis/image-report`, { method: 'POST', body, signal: request.signal })
  } catch (error) {
    if (request.signal?.aborted) throw new AbortedError()
    throw error
  }
  if (!response.ok) {
    let message = `Image analysis failed (HTTP ${response.status}).`
    try {
      const data = (await response.json()) as { detail?: string }
      if (data.detail) message = data.detail
    } catch { /* keep fallback */ }
    throw new Error(message)
  }
  return (await response.json()) as ImageReport
}


export interface KeySensitivityPoint {
  phase_error_rad: number
  key_error_percent: number
  mse: number
  psnr_db: number
  correlation: number
  difference_mean: number
}

export interface KeySensitivityReport {
  max_phase_error_rad: number
  steps: number
  points: KeySensitivityPoint[]
}

export async function imageKeySensitivityReport(request: {
  original: File
  realFile: File
  imaginaryFile: File
  passphrase: string
  maxPhaseError: number
  steps: number
  signal?: AbortSignal
}): Promise<KeySensitivityReport> {
  const body = new FormData()
  body.set('original', request.original)
  body.set('real_file', request.realFile)
  body.set('imaginary_file', request.imaginaryFile)
  body.set('passphrase', request.passphrase)
  body.set('max_phase_error', String(request.maxPhaseError))
  body.set('steps', String(request.steps))
  const response = await fetch(`${API_BASE_URL}/analysis/key-sensitivity`, {
    method: 'POST', body, signal: request.signal,
  })
  if (!response.ok) {
    let message = `Key sensitivity analysis failed (HTTP ${response.status}).`
    try { const data = (await response.json()) as { detail?: string }; if (data.detail) message = data.detail } catch { /* fallback */ }
    throw new Error(message)
  }
  return (await response.json()) as KeySensitivityReport
}
