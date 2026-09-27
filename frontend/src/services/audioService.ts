/** Audio-domain operations, one per `phaseforge` command. */

import { normalizeReport } from '@/lib/report'
import { form, postArtifact, postJson } from '@/services/client'
import type {
  ArtifactResult,
  AudioAttackReportRequest,
  AudioDecryptRequest,
  AudioEncryptRequest,
  DenoiseRequest,
  EnhanceRequest,
  RobustnessReport,
  ServiceResult,
  WatermarkEmbedRequest,
  WatermarkExtractRequest,
} from '@/services/types'

/** Defaults lifted from `audio/drpe.py`, `audio/denoise.py` and `audio/enhance.py`. */
export const AUDIO_DEFAULTS = {
  blockSize: 4096,
  denoiseReductionDb: 20,
  smoothing: 0.98,
  noiseFrames: 6,
  enhanceReductionDb: 15,
  harmonics: 0.5,
  clarityDb: 4,
  normalize: true,
} as const

/** The powers of two inside the backend's accepted block-size range. */
export const BLOCK_SIZES = [256, 1024, 2048, 4096, 8192, 16384] as const

/** `phaseforge audio-encrypt` -- block-based DRPE, saved as one noise WAV. */
export function encryptAudio(
  request: AudioEncryptRequest,
): Promise<ServiceResult<ArtifactResult>> {
  const keyMode = request.keyMode ?? 'passphrase'
  return postArtifact(
    'audio-encrypt',
    'audio/encrypt',
    form({
      file: request.input,
      key_mode: keyMode,
      passphrase: keyMode === 'passphrase' ? request.passphrase : undefined,
      key_file: keyMode !== 'passphrase' ? request.keyFile : undefined,
      block_size: String(request.blockSize),
    }),
    'cipher.wav',
    [
      { label: 'Source', value: request.input.name },
      { label: 'Block size', value: `${request.blockSize} samples` },
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

/** `phaseforge audio-decrypt` -- invert block DRPE from the cipher WAV and passphrase. */
export function decryptAudio(
  request: AudioDecryptRequest,
): Promise<ServiceResult<ArtifactResult>> {
  const keyMode = request.keyMode ?? 'passphrase'
  return postArtifact(
    'audio-decrypt',
    'audio/decrypt',
    form({
      file: request.container,
      key_mode: keyMode,
      passphrase: keyMode === 'passphrase' ? request.passphrase : undefined,
      key_file: keyMode !== 'passphrase' ? request.keyFile : undefined,
    }),
    'restored.wav',
    [
      { label: 'Cipher', value: request.container.name },
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

/** `phaseforge audio-watermark-embed` -- hide a shorter recording in the spectrum. */
export function embedAudioWatermark(
  request: WatermarkEmbedRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return postArtifact(
    'audio-watermark-embed',
    'audio/watermark/embed',
    form({
      file: request.input,
      watermark_file: request.watermark,
    }),
    'watermarked.wav',
    [
      { label: 'Recording', value: request.input.name },
      { label: 'Watermark', value: request.watermark.name },
    ],
    request.signal,
  )
}

/** `phaseforge audio-watermark-extract` -- recover the hidden recording by differencing. */
export function extractAudioWatermark(
  request: WatermarkExtractRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return postArtifact(
    'audio-watermark-extract',
    'audio/watermark/extract',
    form({
      original: request.original,
      marked: request.marked,
    }),
    'watermark.wav',
    [
      { label: 'Original', value: request.original.name },
      { label: 'Watermarked', value: request.marked.name },
    ],
    request.signal,
  )
}

/** `phaseforge denoise` -- OM-LSA suppression with a tracked noise estimate. */
export function denoiseAudio(
  request: DenoiseRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return postArtifact(
    'denoise',
    'audio/denoise',
    form({
      file: request.input,
      reduction_db: String(request.reductionDb),
      smoothing: String(request.smoothing),
      noise_frames: String(request.noiseFrames),
    }),
    'denoised.wav',
    [
      { label: 'Method', value: 'OM-LSA' },
      { label: 'Max reduction', value: `${request.reductionDb} dB` },
      { label: 'Smoothing', value: String(request.smoothing) },
    ],
    request.signal,
  )
}

/** `phaseforge enhance` -- TSNR + harmonic regeneration, clarity EQ and levelling. */
export function enhanceAudio(
  request: EnhanceRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return postArtifact(
    'enhance',
    'audio/enhance',
    form({
      file: request.input,
      reduction_db: String(request.reductionDb),
      harmonics: String(request.harmonics),
      clarity_db: String(request.clarityDb),
      normalize: String(request.normalize),
    }),
    'enhanced.wav',
    [
      { label: 'Noise reduction', value: request.reductionDb ? `${request.reductionDb} dB` : 'Off' },
      { label: 'Harmonics', value: String(request.harmonics) },
      { label: 'Clarity', value: `+${request.clarityDb} dB` },
      { label: 'Levelling', value: request.normalize ? '−20 dBFS' : 'Off' },
    ],
    request.signal,
  )
}

/** `phaseforge attack-report` for an audio cipher WAV. */
export function audioRobustnessReport(
  request: AudioAttackReportRequest,
): Promise<ServiceResult<RobustnessReport>> {
  const keyMode = request.keyMode ?? 'passphrase'
  return postJson(
    'attack-report',
    'analysis/attack-report',
    form({
      ciphertext: request.ciphertext,
      original: request.original,
      key_mode: keyMode,
      passphrase: keyMode === 'passphrase' ? request.passphrase : undefined,
      key_file: keyMode !== 'passphrase' ? request.keyFile : undefined,
    }),
    normalizeReport,
    request.signal,
  )
}
