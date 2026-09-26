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
  | 'spectrum'
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

export interface SpectrumRequest extends BaseOptions {
  /** An ordinary image or a cipher PNG; the backend tells them apart. */
  input: File
  /** Display gamma applied to the log-scaled magnitude. */
  gamma: number
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
  /** Spectral subtraction factor. Higher removes more, at the cost of musical noise. */
  overSubtraction: number
  /** Fraction of the original magnitude that is always kept. */
  floor: number
  /** Opening frames assumed to be noise only. */
  noiseFrames: number
}

export interface EnhanceRequest extends BaseOptions {
  input: File
  /** Gain applied to the speech band. */
  boost: number
  /** Gate threshold, as a multiple of each frame's median magnitude. */
  gateThreshold: number
  /** Gain applied to gated bins. */
  gateFloor: number
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
