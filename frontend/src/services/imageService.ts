/**
 * Image-domain operations.
 *
 * Encryption and decryption use the Python API. The remaining operations stay
 * as deliberate placeholders until they are connected separately.
 */

import { notImplemented, postArtifact, postCipherPair, postForm } from '@/services/client'
import type {
  ArtifactResult,
  FilterRequest,
  ImageDecryptRequest,
  ImageEncryptRequest,
  ImageAttackReportRequest,
  RobustnessReport,
  ServiceResult,
  SpectrumRequest,
  WatermarkEmbedRequest,
  WatermarkExtractRequest,
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
  return notImplemented('watermark-embed', request.signal)
}

/** `phaseforge watermark-extract` -- recover a mark by differencing. */
export function extractWatermark(
  request: WatermarkExtractRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return notImplemented('watermark-extract', request.signal)
}

/** `phaseforge filter` -- low/high/band-pass in the frequency domain. */
export function applyFilter(
  request: FilterRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return notImplemented('filter', request.signal)
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
  return postForm('attack-report', body, request.signal, 'analysis/attack-report')
}
