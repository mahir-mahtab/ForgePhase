/**
 * Image-domain operations.
 *
 * One function per `phaseforge` image command. Each is a do-nothing stub: it
 * validates nothing, sends nothing, and resolves with `not-implemented`. The
 * signatures are the real contract, so wiring the backend means replacing the
 * `notImplemented(...)` body with `postForm(...)` and nothing else.
 */

import { notImplemented } from '@/services/client'
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
  return notImplemented('image-encrypt', request.signal)
}

/** `phaseforge image-decrypt` -- invert DRPE from a `.npz` container. */
export function decryptImage(
  request: ImageDecryptRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return notImplemented('image-decrypt', request.signal)
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
