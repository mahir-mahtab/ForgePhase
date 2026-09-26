/**
 * Image-domain operations.
 *
 * Encryption and decryption use the Python API. The remaining operations stay
 * as deliberate placeholders until they are connected separately.
 */

import { postArtifact, postCipherPair, postForm } from '@/services/client'
import type {
  ArtifactResult,
  FilterRequest,
  FilterPlaygroundResult,
  ImageDecryptRequest,
  ImageEncryptRequest,
  ImageKeySensitivityRequest,
  ImageKeySensitivityReport,
  ImageAttackReportRequest,
  RobustnessReport,
  ServiceResult,
  SpectrumRequest,
  WatermarkEmbedRequest,
  WatermarkExtractRequest,
  WatermarkAnalysis,
  WatermarkAnalysisRequest,
  CipherPairResult,
} from '@/services/types'

/** Defaults lifted from `phaseforge/cli.py` so the UI opens on valid values. */
export const IMAGE_DEFAULTS = {
  watermarkStrength: 0.15,
  watermarkPosition: 0.25,
  filterCutoff: 0.3,
  filterHighCutoff: 0.6,
  filterOrder: 2,
  spectrumGamma: 1.0,
} as const

/** `phaseforge image-encrypt` -- DRPE over the 2D spectrum. */
export function encryptImage(
  request: ImageEncryptRequest,
): Promise<ServiceResult<CipherPairResult>> {
  const body = new FormData()
  body.set('file', request.input)
  body.set('passphrase', request.passphrase)
  body.set('greyscale', String(request.greyscale))
  body.set('backend', request.backend)

  return postCipherPair(
    'image-encrypt',
    'image/encrypt',
    body,
    [
      { label: 'Source', value: request.input.name },
      { label: 'Backend', value: request.backend },
      { label: 'Colour', value: request.greyscale ? 'greyscale' : 'original' },
    ],
    request.signal,
  )
}

/** `phaseforge image-decrypt` -- invert DRPE from a real/imaginary PNG pair. */
export function decryptImage(
  request: ImageDecryptRequest,
): Promise<ServiceResult<ArtifactResult>> {
  const body = new FormData()
  body.set('real_file', request.realFile)
  body.set('imaginary_file', request.imaginaryFile)
  body.set('passphrase', request.passphrase)
  body.set('backend', request.backend)

  return postArtifact(
    'image-decrypt',
    'image/decrypt',
    body,
    'restored.png',
    [
      { label: 'Real component', value: request.realFile.name },
      { label: 'Imaginary component', value: request.imaginaryFile.name },
      { label: 'Backend', value: request.backend },
    ],
    request.signal,
  )
}

/** `phaseforge watermark-embed` -- write a mark into the magnitude spectrum. */
export function embedWatermark(
  request: WatermarkEmbedRequest,
): Promise<ServiceResult<ArtifactResult>> {
  const body = new FormData()

  body.set('file', request.input)
  body.set('watermark_file', request.watermark)
  body.set('strength', String(request.strength))
  body.set('position', String(request.position))

  return postArtifact(
    'watermark-embed',
    'image/watermark/embed',
    body,
    'watermarked.png',
    [
      { label: 'Source', value: request.input.name },
      { label: 'Watermark', value: request.watermark.name },
    ],
    request.signal,
  )
}

/** Quantify watermark visibility, spectral change, and extraction quality. */
export function analyzeWatermark(
  request: WatermarkAnalysisRequest,
): Promise<ServiceResult<WatermarkAnalysis>> {
  const body = new FormData()
  body.set('original', request.original)
  body.set('marked', request.marked)
  if (request.watermark) body.set('watermark_file', request.watermark)
  if (request.height) body.set('height', String(request.height))
  if (request.width) body.set('width', String(request.width))
  body.set('strength', String(request.strength))
  body.set('position', String(request.position))
  return postForm<WatermarkAnalysis>('watermark-analyze', body, request.signal, 'image/watermark/analyze')
}

/** `phaseforge watermark-extract` -- recover a mark by differencing. */
export function extractWatermark(
  request: WatermarkExtractRequest,
): Promise<ServiceResult<ArtifactResult>> {
  const body = new FormData()
  body.set('original', request.original)
  body.set('marked', request.marked)
  body.set('height', String(request.height))
  body.set('width', String(request.width))
  body.set('strength', String(request.strength))
  body.set('position', String(request.position))
  return postArtifact('watermark-extract', 'image/watermark/extract', body, 'watermark.png', [{ label: 'Marked image', value: request.marked.name }], request.signal)
}

/** `phaseforge filter` -- low/high/band-pass in the frequency domain. */
export async function applyFilter(
  request: FilterRequest,
): Promise<ServiceResult<ArtifactResult>> {
  const body = new FormData()
  body.set('file', request.input)
  body.set('kind', request.kind)
  body.set('cutoff', String(request.cutoff))
  if (request.highCutoff !== null) body.set('high_cutoff', String(request.highCutoff))
  body.set('filter_shape', request.filterShape)
  body.set('order', String(request.order))
  return postArtifact(
    'filter',
    'image/filter',
    body,
    'filtered.png',
    [
      { label: 'Source', value: request.input.name },
      { label: 'Type', value: request.kind },
      { label: 'Shape', value: request.filterShape },
      { label: 'Cutoff', value: request.cutoff.toFixed(2) },
    ],
    request.signal,
  )
}

/** Run filtering plus the two spectrum views used by the Frequency Lab. */
export async function runFilterPlayground(
  request: FilterRequest,
): Promise<ServiceResult<FilterPlaygroundResult>> {
  const filtered = await applyFilter(request)
  if (filtered.status !== 'ok') return filtered
  if (!filtered.data.artifact.url) {
    return { status: 'error', operation: 'filter', message: 'The filtered artifact has no preview URL.' }
  }

  const inputSpectrum = await renderSpectrum({
    input: request.input,
    gamma: 1,
    backend: request.backend,
    signal: request.signal,
  })
  if (inputSpectrum.status !== 'ok') return inputSpectrum

  const filteredBlob = await fetch(filtered.data.artifact.url, { signal: request.signal }).then((response) => {
    if (!response.ok) throw new Error('Could not read the filtered preview.')
    return response.blob()
  })
  const filteredFile = new File([filteredBlob], 'filtered.png', { type: filteredBlob.type || 'image/png' })
  const filteredSpectrum = await renderSpectrum({
    input: filteredFile,
    gamma: 1,
    backend: request.backend,
    signal: request.signal,
  })
  if (filteredSpectrum.status !== 'ok') return filteredSpectrum

  return {
    status: 'ok',
    data: { filtered: filtered.data, inputSpectrum, filteredSpectrum },
  }
}

/** `phaseforge spectrum` -- render a log-scaled magnitude image. */
export function renderSpectrum(
  request: SpectrumRequest,
): Promise<ServiceResult<ArtifactResult>> {
  const body = new FormData()
  if (request.input) body.set(request.imaginaryFile ? 'real_file' : 'file', request.input)
  if (request.imaginaryFile) body.set('imaginary_file', request.imaginaryFile)
  body.set('gamma', String(request.gamma))
  return postArtifact(
    'spectrum',
    'image/spectrum',
    body,
    'spectrum.png',
    [{ label: 'Source', value: request.input?.name ?? 'cipher pair' }],
    request.signal,
  )
}

/** `phaseforge attack-report` for an image cipher pair. */
export function imageRobustnessReport(
  request: ImageAttackReportRequest,
): Promise<ServiceResult<RobustnessReport>> {
  const body = new FormData()
  body.set('real_file', request.realFile)
  body.set('imaginary_file', request.imaginaryFile)
  body.set('original', request.original)
  body.set('passphrase', request.passphrase)
  body.set('level', String(request.level ?? 0.10))
  body.set('profile', request.profile ?? 'all')
  return postForm<{ kind: 'image'; report: Record<string, Record<string, number>> }>('attack-report', body, request.signal, 'analysis/attack-report').then((result) => {
    if (result.status !== 'ok') return result
    return { ...result, data: { kind: result.data.kind, rows: Object.entries(result.data.report).map(([attack, metrics]) => ({ attack, level: request.level ?? 0.10, metrics })) } }
  })
}

export async function imageKeySensitivityReport(
  request: ImageKeySensitivityRequest,
): Promise<ServiceResult<ImageKeySensitivityReport>> {
  const form = new FormData()

  form.append('original', request.original)
  form.append('real_file', request.realFile)
  form.append('imaginary_file', request.imaginaryFile)
  form.append('passphrase', request.passphrase)

  form.append(
    'max_phase_error',
    String(request.maxPhaseError ?? Math.PI),
  )

  form.append(
    'steps',
    String(request.steps ?? 9),
  )

  return postForm<ImageKeySensitivityReport>(
    'image-key-sensitivity',
    form,
    undefined,
    'analysis/key-sensitivity',
  )
}