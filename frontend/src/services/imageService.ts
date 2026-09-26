/** Image-domain operations, one per `phaseforge` command. */

import { normalizeReport, parseMetric } from '@/lib/report'
import { form, postArtifact, postJson } from '@/services/client'
import type {
  ArtifactResult,
  FilterRequest,
  HybridRequest,
  ImageAttackReportRequest,
  ImageDecryptRequest,
  ImageEncryptRequest,
  KeyReuseDemoRequest,
  KeyReuseDemoResult,
  RobustnessReport,
  ServiceResult,
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
  hybridNearCutoff: 0.12,
  hybridFarCutoff: 0.03,
  hybridNearGain: 1.0,
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
      colour: String(request.colour),
    }),
    'watermarked.png',
    [
      { label: 'Carrier', value: request.input.name },
      { label: 'Watermark', value: request.watermark.name },
      { label: 'Strength', value: String(request.strength) },
      { label: 'Position', value: String(request.position) },
      { label: 'Colour', value: request.colour ? 'Kept' : 'Greyscale' },
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
      colour: String(request.colour),
    }),
    'watermark.png',
    [
      { label: 'Size', value: `${request.width} × ${request.height}` },
      { label: 'Strength', value: String(request.strength) },
      { label: 'Position', value: String(request.position) },
      { label: 'Colour', value: request.colour ? 'Kept' : 'Greyscale' },
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

const HYBRID_FILENAMES = {
  hybrid: 'hybrid.png',
  distance: 'distance.png',
  low: 'far_low_pass.png',
  high: 'near_high_pass.png',
} as const

const HYBRID_VIEW_LABELS = {
  hybrid: 'Hybrid',
  distance: 'Hybrid at 1, 1/2, 1/4 and 1/8 size',
  low: 'Far image, low band only',
  high: 'Near image, high band only',
} as const

/** `phaseforge hybrid` -- one image up close, another from a distance. */
export function createHybrid(
  request: HybridRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return postArtifact(
    'hybrid',
    'image/hybrid',
    form({
      near: request.near,
      far: request.far,
      near_cutoff: String(request.nearCutoff),
      far_cutoff: String(request.farCutoff),
      near_gain: String(request.nearGain),
      filter_shape: request.filterShape,
      greyscale: String(request.greyscale),
      view: request.view,
    }),
    HYBRID_FILENAMES[request.view],
    [
      { label: 'Near', value: request.near.name },
      { label: 'Far', value: request.far.name },
      { label: 'Showing', value: HYBRID_VIEW_LABELS[request.view] },
      { label: 'Cutoffs', value: `near ${request.nearCutoff}, far ${request.farCutoff}` },
      { label: 'Near gain', value: String(request.nearGain) },
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

/** `phaseforge key-reuse-demo` -- recover a plaintext from a reused key. */
export function runKeyReuseDemo(
  request: KeyReuseDemoRequest,
): Promise<ServiceResult<KeyReuseDemoResult>> {
  return postJson(
    'key-reuse-demo',
    'analysis/key-reuse-demo',
    { size: request.size },
    (raw) => {
      const body = raw as {
        size: number
        probes_used: number
        correlation: unknown
        max_absolute_error: unknown
        images: KeyReuseDemoResult['images']
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
