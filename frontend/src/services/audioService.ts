/**
 * Audio-domain operations.
 *
 * Encryption and decryption use the Python API. The remaining operations stay
 * as deliberate placeholders until they are connected separately.
 */

import { postArtifact, postForm } from '@/services/client'
import type {
  ArtifactResult,
  AudioAnalysisRequest,
  AudioAnalysisResult,
  AudioSecurityRequest,
  AudioSecurityReport,
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

export function analyzeAudio(request: AudioAnalysisRequest): Promise<ServiceResult<AudioAnalysisResult>> {
  const body = new FormData()
  body.set('file', request.input)
  body.set('frame_size', String(request.frameSize))
  body.set('backend', request.backend)
  return postForm<AudioAnalysisResult>('audio-analysis', body, request.signal, 'audio/analyze')
}

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
  const body = new FormData()
  body.set('file', request.input)
  body.set('over_subtraction', String(request.overSubtraction))
  body.set('floor', String(request.floor))
  return postArtifact('denoise', 'audio/denoise', body, 'denoised.wav', [{ label: 'Source', value: request.input.name }], request.signal)
}

/** `phaseforge enhance` -- speech-band boost plus a noise gate. */
export function enhanceAudio(
  request: EnhanceRequest,
): Promise<ServiceResult<ArtifactResult>> {
  const body = new FormData()
  body.set('file', request.input)
  body.set('boost', String(request.boost))
  body.set('gate_threshold', String(request.gateThreshold))
  return postArtifact('enhance', 'audio/enhance', body, 'enhanced.wav', [{ label: 'Source', value: request.input.name }], request.signal)
}

/** `phaseforge attack-report` for an audio container. */
export function audioRobustnessReport(
  request: AttackReportRequest,
): Promise<ServiceResult<RobustnessReport>> {
  const body = new FormData()
  body.set('ciphertext', request.ciphertext)
  body.set('original', request.original)
  body.set('passphrase', request.passphrase)
  body.set('level', String(request.level ?? 0.10))
  body.set('profile', request.profile ?? 'all')
  return postForm<{ kind: 'audio'; report: Record<string, Record<string, number>> }>('attack-report', body, request.signal, 'analysis/attack-report').then((result) => {
    if (result.status !== 'ok') return result
    return { ...result, data: { kind: result.data.kind, rows: Object.entries(result.data.report).map(([attack, metrics]) => ({ attack, level: request.level ?? 0.10, metrics })) } }
  })
}


export function audioSecurityReport(
  request: AudioSecurityRequest,
): Promise<ServiceResult<AudioSecurityReport>> {
  const body = new FormData()
  body.set('original', request.original)
  body.set('ciphertext', request.ciphertext)
  body.set('passphrase', request.passphrase)
  body.set('wrong_passphrase', request.wrongPassphrase)
  body.set('phase_error', String(request.maxPhaseError))
  body.set('steps', String(request.steps))
  body.set('backend', request.backend)
  return postForm<AudioSecurityReport>('audio-security-report', body, request.signal, 'audio/security-report')
}
