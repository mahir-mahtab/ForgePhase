/**
 * Contract types for the PhaseForge backend.
 *
 * Requests mirror the `phaseforge` CLI one operation at a time; the services
 * translate them into the multipart fields the Python API accepts. Nothing
 * here performs I/O.
 */

export type DomainKind = 'image' | 'audio'

/** `phaseforge filter --kind {...}` */
export type FilterKind = 'low' | 'high' | 'band'

/** `phaseforge filter --filter-shape {...}`, from `freq_edit.FILTER_SHAPES`. */
export type FilterShape = 'ideal' | 'gaussian' | 'butterworth'

/** Every operation the UI can invoke, keyed by its CLI command name. */
export type OperationId =
  | 'image-encrypt'
  | 'image-decrypt'
  | 'watermark-embed'
  | 'watermark-extract'
  | 'filter'
  | 'hybrid'
  | 'audio-encrypt'
  | 'audio-decrypt'
  | 'denoise'
  | 'enhance'
  | 'attack-report'
  | 'key-reuse-demo'

/** Options every operation accepts. */
export interface BaseOptions {
  signal?: AbortSignal
}

export type KeyMode = 'passphrase' | 'image' | 'audio'

/** Options for specifying cryptographic key material. */
export interface KeyOptions {
  keyMode?: KeyMode
  passphrase?: string
  keyFile?: File | null
}

/* -------------------------------------------------------------------------- */
/* Requests                                                                    */
/* -------------------------------------------------------------------------- */

export interface ImageEncryptRequest extends BaseOptions, KeyOptions {
  input: File
  /** Collapse to a single channel before transforming. */
  greyscale: boolean
}

export interface ImageDecryptRequest extends BaseOptions, KeyOptions {
  /** The noise-like cipher PNG produced by `image-encrypt`. */
  cipherFile: File
}

export interface WatermarkEmbedRequest extends BaseOptions {
  input: File
  watermark: File
  /** Embedding gain. Higher survives more, but is easier to see. */
  strength: number
  /** Offset above DC, as a fraction of the image height. */
  position: number
  /** Keep the mark's colour, one plane per carrier channel. */
  colour: boolean
}

export interface WatermarkExtractRequest extends BaseOptions {
  original: File
  marked: File
  /** The watermark's own dimensions, which extraction cannot infer. */
  height: number
  width: number
  strength: number
  position: number
  colour: boolean
}

export interface FilterRequest extends BaseOptions {
  input: File
  kind: FilterKind
  /** Fraction of the Nyquist limit: 0 is DC, 1 is the spectrum edge. */
  cutoff: number
  /** Upper edge for band-pass; must exceed `cutoff`. Ignored otherwise. */
  highCutoff: number | null
  filterShape: FilterShape
  /** Butterworth roll-off steepness. Ignored by the other shapes. */
  order: number
}

/** What `/api/image/hybrid` sends back; the CLI writes `hybrid` and, with `--distance`, `distance`. */
export type HybridView = 'hybrid' | 'distance' | 'low' | 'high'

export interface HybridRequest extends BaseOptions {
  /** Seen up close: only its fine detail is kept. */
  near: File
  /** Seen from a distance: only its broad shapes are kept. Fitted to `near`'s size. */
  far: File
  /** High-pass cutoff for `near`, as a fraction of Nyquist. */
  nearCutoff: number
  /** Low-pass cutoff for `far`; keep it below `nearCutoff`. */
  farCutoff: number
  /** Gain on the near image's detail. */
  nearGain: number
  filterShape: FilterShape
  greyscale: boolean
  view: HybridView
}

export interface AudioEncryptRequest extends BaseOptions, KeyOptions {
  input: File
  /** Samples per DRPE block; a power of two. */
  blockSize: number
}

export interface AudioDecryptRequest extends BaseOptions, KeyOptions {
  /** The noise-like cipher WAV produced by `audio-encrypt`. */
  container: File
}

export interface DenoiseRequest extends BaseOptions {
  input: File
  /** OM-LSA gain floor: the most a noise-only bin is turned down, in dB. */
  reductionDb: number
  /** Decision-directed SNR smoothing in [0, 1). Higher is steadier, with softer onsets. */
  smoothing: number
  /** Opening frames that seed the noise tracker. */
  noiseFrames: number
}

export interface EnhanceRequest extends BaseOptions {
  input: File
  /** Most a noise-only bin is turned down, in dB; 0 turns noise reduction off. */
  reductionDb: number
  /** Weight of the regenerated harmonic spectrum, 0 to 1. */
  harmonics: number
  /** Lift of the 300-3400 Hz speech band, in dB. */
  clarityDb: number
  /** Level the active speech to a fixed loudness. */
  normalize: boolean
}

export interface AudioAttackReportRequest extends BaseOptions, KeyOptions {
  ciphertext: File
  original: File
}

export interface ImageAttackReportRequest extends BaseOptions, KeyOptions {
  cipherFile: File
  original: File
}

export interface KeyReuseDemoRequest extends BaseOptions {
  size: number
}

/* -------------------------------------------------------------------------- */
/* Responses                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A file the backend produced, held in memory. Components derive a blob URL
 * from `file` with `useObjectUrl`, which owns the URL's lifetime.
 */
export interface Artifact {
  file: File
  name: string
  mimeType: string
  byteLength: number
}

export type Detail = { label: string; value: string }

/** The payload most operations return: an output file plus what made it. */
export interface ArtifactResult {
  artifact: Artifact
  details: Detail[]
}

/**
 * One row of `attacks.robustness_report`. Metric keys are the backend's
 * snake_case names; non-finite values arrive as strings and are parsed back
 * to `Infinity`/`NaN`.
 */
export interface RobustnessRow {
  attack: string
  metrics: Record<string, number>
}

export interface RobustnessReport {
  kind: DomainKind
  rows: RobustnessRow[]
}

export interface KeyReuseDemoResult {
  size: number
  probesUsed: number
  correlation: number
  maxAbsoluteError: number
  images: { secret: string; ciphertext: string; recovered: string }
}

export interface BackendInfo {
  version: string
  limits: {
    maxImagePixels: number
    maxAudioSamples: number
    maxAudioChannels: number
  }
}

/* -------------------------------------------------------------------------- */
/* Result envelope                                                             */
/* -------------------------------------------------------------------------- */

/** Every service resolves to one of these; failures are values, not throws. */
export type ServiceResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'error'; operation: OperationId; message: string }
