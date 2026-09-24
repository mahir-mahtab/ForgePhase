/** Image-domain operations, one per `phaseforge` command. */

import { normalizeReport, parseMetric } from '@/lib/report'
import { form, postArtifact, postJson } from '@/services/client'
import type {
  ArtifactResult,
  FilterRequest,
  ImageAttackReportRequest,
  ImageDecryptRequest,
  ImageEncryptRequest,
  KpaDemoRequest,
  KpaDemoResult,
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

/** `phaseforge image-encrypt` -- DRPE over the 2D spectrum, saved as one noise PNG. */
export function encryptImage(
  request: ImageEncryptRequest,
): Promise<ServiceResult<ArtifactResult>> {
  const keyMode = request.keyMode ?? 'passphrase'
  return postArtifact(
    'image-encrypt',
    'image/encrypt',
    form({
      file: request.input,
      key_mode: keyMode,
      passphrase: keyMode === 'passphrase' ? request.passphrase : undefined,
      key_file: keyMode !== 'passphrase' ? request.keyFile : undefined,
      greyscale: String(request.greyscale),
    }),
    'cipher.png',
    [
      { label: 'Source', value: request.input.name },
      { label: 'Colour', value: request.greyscale ? 'Greyscale' : 'Original' },
      {
        label: 'Key',
        value:
          keyMode === 'passphrase'
            ? 'Passphrase'
            : keyMode === 'image'
              ? `Image (${request.keyFile?.name ?? 'key.png'})`
              : `Audio (${request.keyFile?.name ?? 'key.wav'})`,
      },
    ],
    request.signal,
  )
}

/** `phaseforge image-decrypt` -- invert DRPE from the cipher PNG and passphrase. */
export function decryptImage(
  request: ImageDecryptRequest,
): Promise<ServiceResult<ArtifactResult>> {
  const keyMode = request.keyMode ?? 'passphrase'
  return postArtifact(
    'image-decrypt',
    'image/decrypt',
    form({
      file: request.cipherFile,
      key_mode: keyMode,
      passphrase: keyMode === 'passphrase' ? request.passphrase : undefined,
      key_file: keyMode !== 'passphrase' ? request.keyFile : undefined,
    }),
    'restored.png',
    [
      { label: 'Cipher', value: request.cipherFile.name },
      {
        label: 'Key',
        value:
          keyMode === 'passphrase'
            ? 'Passphrase'
            : keyMode === 'image'
              ? `Image (${request.keyFile?.name ?? 'key.png'})`
              : `Audio (${request.keyFile?.name ?? 'key.wav'})`,
      },
    ],
    request.signal,
  )
}

/** `phaseforge watermark-embed` -- write a mark into the magnitude spectrum. */
export function embedWatermark(
  request: WatermarkEmbedRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return postArtifact(
    'watermark-embed',
    'image/watermark/embed',
    form({
      file: request.input,
      watermark_file: request.watermark,
      strength: String(request.strength),
      position: String(request.position),
    }),
    'watermarked.png',
    [
      { label: 'Carrier', value: request.input.name },
      { label: 'Watermark', value: request.watermark.name },
      { label: 'Strength', value: String(request.strength) },
      { label: 'Position', value: String(request.position) },
    ],
    request.signal,
  )
}

/** `phaseforge watermark-extract` -- recover a mark by differencing. */
export function extractWatermark(
  request: WatermarkExtractRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return postArtifact(
    'watermark-extract',
    'image/watermark/extract',
    form({
      original: request.original,
      marked: request.marked,
      height: String(request.height),
      width: String(request.width),
      strength: String(request.strength),
      position: String(request.position),
    }),
    'watermark.png',
    [
      { label: 'Size', value: `${request.width} × ${request.height}` },
      { label: 'Strength', value: String(request.strength) },
      { label: 'Position', value: String(request.position) },
    ],
    request.signal,
  )
}

/** `phaseforge filter` -- low/high/band-pass in the frequency domain. */
export function applyFilter(
  request: FilterRequest,
): Promise<ServiceResult<ArtifactResult>> {
  const fields: Record<string, string | Blob> = {
    file: request.input,
    kind: request.kind,
    cutoff: String(request.cutoff),
    filter_shape: request.filterShape,
    order: String(request.order),
  }
  if (request.kind === 'band' && request.highCutoff !== null) {
    fields.high_cutoff = String(request.highCutoff)
  }

  return postArtifact(
    'filter',
    'image/filter',
    form(fields),
    'filtered.png',
    [
      { label: 'Filter', value: `${request.kind}-pass, ${request.filterShape}` },
      {
        label: 'Cutoff',
        value:
          request.kind === 'band'
            ? `${request.cutoff} – ${request.highCutoff}`
            : String(request.cutoff),
      },
    ],
    request.signal,
  )
}

/** `phaseforge spectrum` -- render a log-scaled magnitude image. */
export function renderSpectrum(
  request: SpectrumRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return postArtifact(
    'spectrum',
    'image/spectrum',
    form({
      file: request.input,
      gamma: String(request.gamma),
    }),
    'spectrum.png',
    [
      { label: 'Source', value: request.input.name },
      { label: 'Gamma', value: String(request.gamma) },
    ],
    request.signal,
  )
}

/** `phaseforge attack-report` for an image cipher PNG. */
export function imageRobustnessReport(
  request: ImageAttackReportRequest,
): Promise<ServiceResult<RobustnessReport>> {
  const keyMode = request.keyMode ?? 'passphrase'
  return postJson(
    'attack-report',
    'analysis/attack-report',
    form({
      ciphertext: request.cipherFile,
      original: request.original,
      key_mode: keyMode,
      passphrase: keyMode === 'passphrase' ? request.passphrase : undefined,
      key_file: keyMode !== 'passphrase' ? request.keyFile : undefined,
    }),
    normalizeReport,
    request.signal,
  )
}

/** `phaseforge kpa-demo` -- recover a plaintext from a reused key. */
export function runKpaDemo(
  request: KpaDemoRequest,
): Promise<ServiceResult<KpaDemoResult>> {
  return postJson(
    'kpa-demo',
    'analysis/kpa-demo',
    { size: request.size },
    (raw) => {
      const body = raw as {
        size: number
        probes_used: number
        correlation: unknown
        max_absolute_error: unknown
        images: KpaDemoResult['images']
      }
      return {
        size: body.size,
        probesUsed: body.probes_used,
        correlation: parseMetric(body.correlation),
        maxAbsoluteError: parseMetric(body.max_absolute_error),
        images: body.images,
      }
    },
    request.signal,
  )
}
