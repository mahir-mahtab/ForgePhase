/**
 * Image-domain operations.
 *
 * Encryption and decryption use the Python API. The remaining operations stay
 * as deliberate placeholders until they are connected separately.
 */

import { notImplemented, postArtifact } from '@/services/client'
import type {
  ArtifactResult,
  AttackReportRequest,
  FilterRequest,
  ImageDecryptRequest,
  ImageEncryptRequest,
  RobustnessReport,
  ServiceResult,
  SpectrumRequest,
  WatermarkEmbedRequest,
  WatermarkExtractRequest,
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
): Promise<ServiceResult<ArtifactResult>> {
  const body = new FormData()
  body.set('file', request.input)
  body.set('passphrase', request.passphrase)
  body.set('greyscale', String(request.greyscale))
  body.set('backend', request.backend)

  return postArtifact(
    'image-encrypt',
    'image/encrypt',
    body,
    'cipher.npz',
    [
      { label: 'Source', value: request.input.name },
      { label: 'Backend', value: request.backend },
      { label: 'Colour', value: request.greyscale ? 'greyscale' : 'original' },
    ],
    request.signal,
  )
}

/** `phaseforge image-decrypt` -- invert DRPE from a `.npz` container. */
export function decryptImage(
  request: ImageDecryptRequest,
): Promise<ServiceResult<ArtifactResult>> {
  const body = new FormData()
  body.set('file', request.container)
  body.set('passphrase', request.passphrase)
  body.set('backend', request.backend)

  return postArtifact(
    'image-decrypt',
    'image/decrypt',
    body,
    'restored.png',
    [
      { label: 'Container', value: request.container.name },
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
  return notImplemented('spectrum', request.signal)
}

/** `phaseforge attack-report` for an image container. */
export function imageRobustnessReport(
  request: AttackReportRequest,
): Promise<ServiceResult<RobustnessReport>> {
  return notImplemented('attack-report', request.signal)
}
