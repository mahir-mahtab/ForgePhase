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
} from '@/services/types'

/** Defaults lifted from `phaseforge/cli.py` and `audio/drpe.py`. */
export const AUDIO_DEFAULTS = {
  blockSize: 4096,
  overSubtraction: 2.0,
  floor: 0.05,
  noiseFrames: 6,
  boost: 2.0,
  gateThreshold: 1.5,
  gateFloor: 0.1,
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

/** `phaseforge denoise` -- spectral subtraction against an estimated floor. */
export function denoiseAudio(
  request: DenoiseRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return postArtifact(
    'denoise',
    'audio/denoise',
    form({
      file: request.input,
      over_subtraction: String(request.overSubtraction),
      floor: String(request.floor),
      noise_frames: String(request.noiseFrames),
    }),
    'denoised.wav',
    [
      { label: 'Strength', value: String(request.overSubtraction) },
      { label: 'Floor', value: String(request.floor) },
      { label: 'Noise sample', value: `${request.noiseFrames} frames` },
    ],
    request.signal,
  )
}

/** `phaseforge enhance` -- speech-band boost plus a noise gate. */
export function enhanceAudio(
  request: EnhanceRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return postArtifact(
    'enhance',
    'audio/enhance',
    form({
      file: request.input,
      boost: String(request.boost),
      gate_threshold: String(request.gateThreshold),
      gate_floor: String(request.gateFloor),
    }),
    'enhanced.wav',
    [
      { label: 'Speech boost', value: `${request.boost}×` },
      { label: 'Gate threshold', value: String(request.gateThreshold) },
      { label: 'Gate level', value: String(request.gateFloor) },
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
