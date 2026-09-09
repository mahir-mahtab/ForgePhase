/**
 * Contract types for the PhaseForge backend.
 *
 * These mirror the `phaseforge` CLI one operation at a time, so when the HTTP
 * layer is written the request shapes already line up with what the Python
 * side accepts. Nothing here performs I/O.
 */

export type DomainKind = 'image' | 'audio'

/** `phaseforge --backend {...}` -- the DFT implementation to run with. */
export type TransformBackend = 'numpy' | 'custom'

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

/** Options every operation accepts. */
export interface BaseOptions {
  backend: TransformBackend
  signal?: AbortSignal
}

/* -------------------------------------------------------------------------- */
/* Requests                                                                    */
/* -------------------------------------------------------------------------- */

export interface ImageEncryptRequest extends BaseOptions {
  input: File
  passphrase: string
  /** Collapse to a single channel before transforming. */
  greyscale: boolean
}

export interface ImageDecryptRequest extends BaseOptions {
  /** A `.npz` container produced by `image-encrypt`. */
  container: File
  passphrase: string
}

export interface WatermarkEmbedRequest extends BaseOptions {
  input: File
  watermark: File
  /** Embedding gain. Higher survives more, but is easier to see. */
  strength: number
  /** Radial placement in the spectrum, as a fraction of the Nyquist limit. */
  position: number
}

export interface WatermarkExtractRequest extends BaseOptions {
  original: File
  marked: File
  /** The watermark's own dimensions, which extraction cannot infer. */
  height: number
  width: number
  strength: number
  position: number
}

export interface FilterRequest extends BaseOptions {
  input: File
  kind: FilterKind
  /** Fraction of the Nyquist limit: 0 is DC, 1 is the spectrum corner. */
  cutoff: number
  /** Upper edge for band-pass; must exceed `cutoff`. Ignored otherwise. */
  highCutoff: number | null
  filterShape: FilterShape
  /** Butterworth roll-off steepness. Ignored by the other shapes. */
  order: number
}

export interface SpectrumRequest extends BaseOptions {
  /** An image, or a `.npz` ciphertext container. */
  input: File
  /** Display gamma applied to the log-scaled magnitude. */
  gamma: number
}

export interface AudioEncryptRequest extends BaseOptions {
  input: File
  passphrase: string
  /** Samples per DRPE block. Powers of two avoid padding. */
  blockSize: number
}

export interface AudioDecryptRequest extends BaseOptions {
  container: File
  passphrase: string
}

export interface DenoiseRequest extends BaseOptions {
  input: File
  /** Spectral subtraction factor. Higher removes more, at the cost of musical noise. */
  overSubtraction: number
  /** Floor below which the subtracted magnitude is clamped. */
  floor: number
}

export interface EnhanceRequest extends BaseOptions {
  input: File
  /** Gain applied to the speech band. */
  boost: number
  /** Noise gate threshold, relative to the estimated noise floor. */
  gateThreshold: number
}

export interface AttackReportRequest extends BaseOptions {
  ciphertext: File
  original: File
  passphrase: string
}

/* -------------------------------------------------------------------------- */
/* Responses                                                                   */
/* -------------------------------------------------------------------------- */

/** A file the backend produced. `url` is null until a real backend serves one. */
export interface Artifact {
  name: string
  mimeType: string
  byteLength: number | null
  url: string | null
}

export interface ImageMetrics {
  mse: number
  psnrDb: number
  correlation: number
}

export interface AudioMetrics {
  mse: number
  snrDb: number
  segmentalSnrDb: number
  correlation: number
}

export type Metrics = ImageMetrics | AudioMetrics

/** One row of `attacks.robustness_report`. */
export interface RobustnessRow {
  attack: string
  metrics: Metrics
}

export interface RobustnessReport {
  kind: DomainKind
  rows: RobustnessRow[]
}

/** The payload most operations return: an output file plus what made it. */
export interface ArtifactResult {
  artifact: Artifact
  /** Free-form detail lines for the result panel, e.g. ciphertext shape. */
  details: Array<{ label: string; value: string }>
}

/* -------------------------------------------------------------------------- */
/* Result envelope                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Every service resolves to one of these.
 *
 * `not-implemented` is a first-class outcome rather than a thrown error: the
 * backend genuinely is not connected yet, and that is a state the UI should
 * render calmly, not a failure it should apologise for.
 */
export type ServiceResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'not-implemented'; operation: OperationId; message: string }
  | { status: 'error'; operation: OperationId; message: string }
