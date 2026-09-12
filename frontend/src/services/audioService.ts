/**
 * Audio-domain operations.
 *
 * Encryption and decryption use the Python API. The remaining operations stay
 * as deliberate placeholders until they are connected separately.
 */

import { notImplemented, postArtifact } from '@/services/client'
import type {
  ArtifactResult,
  AttackReportRequest,
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
  boost: 2.0,
  gateThreshold: 1.5,
} as const

/** Powers of two only: anything else forces the backend to pad each block. */
export const BLOCK_SIZES = [1024, 2048, 4096, 8192, 16384] as const

/** `phaseforge audio-encrypt` -- block-based DRPE over the waveform. */
export function encryptAudio(
  request: AudioEncryptRequest,
): Promise<ServiceResult<ArtifactResult>> {
  const body = new FormData()
  body.set('file', request.input)
  body.set('passphrase', request.passphrase)
  body.set('block_size', String(request.blockSize))
  body.set('backend', request.backend)

  return postArtifact(
    'audio-encrypt',
    'audio/encrypt',
    body,
    'cipher.npz',
    [
      { label: 'Source', value: request.input.name },
      { label: 'Backend', value: request.backend },
      { label: 'Block size', value: String(request.blockSize) },
    ],
    request.signal,
  )
}

/** `phaseforge audio-decrypt` -- invert block DRPE from a `.npz` container. */
export function decryptAudio(
  request: AudioDecryptRequest,
): Promise<ServiceResult<ArtifactResult>> {
  const body = new FormData()
  body.set('file', request.container)
  body.set('passphrase', request.passphrase)
  body.set('backend', request.backend)

  return postArtifact(
    'audio-decrypt',
    'audio/decrypt',
    body,
    'restored.wav',
    [
      { label: 'Container', value: request.container.name },
      { label: 'Backend', value: request.backend },
    ],
    request.signal,
  )
}

/** `phaseforge denoise` -- spectral subtraction against an estimated floor. */
export function denoiseAudio(
  request: DenoiseRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return notImplemented('denoise', request.signal)
}

/** `phaseforge enhance` -- speech-band boost plus a noise gate. */
export function enhanceAudio(
  request: EnhanceRequest,
): Promise<ServiceResult<ArtifactResult>> {
  return notImplemented('enhance', request.signal)
}

/** `phaseforge attack-report` for an audio container. */
export function audioRobustnessReport(
  request: AttackReportRequest,
): Promise<ServiceResult<RobustnessReport>> {
  return notImplemented('attack-report', request.signal)
}
