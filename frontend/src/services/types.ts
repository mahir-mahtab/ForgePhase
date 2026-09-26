/**
 * Contract types for the PhaseForge backend.
 *
 * These mirror the `phaseforge` CLI one operation at a time, so when the HTTP
 * layer is written the request shapes already line up with what the Python
 * side accepts. Nothing here performs I/O.
 */

export type DomainKind = 'dashboard' | 'image' | 'audio'

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
  | 'watermark-analyze'
  | 'filter'
  | 'spectrum'
  | 'audio-encrypt'
  | 'audio-decrypt'
  | 'denoise'
  | 'enhance'
  | 'attack-report'
  | 'audio-analysis'
  | 'audio-security-report'
  | 'image-key-sensitivity'

/** Options every operation accepts. */
export interface BaseOptions {
  backend: TransformBackend
  signal?: AbortSignal
}

/* -------------------------------------------------------------------------- */
/* Requests                                                                    */
/* -------------------------------------------------------------------------- */

export interface ImageKeySensitivityRequest extends BaseOptions {
  original: File
  realFile: File
  imaginaryFile: File
  passphrase: string
  maxPhaseError?: number
  steps?: number
}

export interface KeySensitivityPoint {
  phase_error_rad: number
  key_error_percent: number
  mse: number
  psnr: number
  mae: number
  difference_mean: number
}

export interface ImageKeySensitivityReport {
  max_phase_error_rad: number
  steps: number
  points: KeySensitivityPoint[]
}

export interface ImageEncryptRequest extends BaseOptions {
  input: File
  passphrase: string
  /** Collapse to a single channel before transforming. */
  greyscale: boolean
}

export interface ImageDecryptRequest extends BaseOptions {
  /** The real and imaginary PNGs produced by `image-encrypt`. */
  realFile: File
  imaginaryFile: File
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

export interface WatermarkAnalysis {
  quality: { mse: number; psnr_db: number | string; correlation: number }
  visibility: { mse: number; psnr_db: number | string; correlation: number; mean_pixel_change: number }
  spectrum: { original_mean_energy: number; marked_mean_energy: number; mean_magnitude_change: number; watermark_region_energy: number | null }
  watermark: { height: number | null; width: number | null; strength: number; position: number }
  extraction?: { correlation: number; mse: number }
}

export interface WatermarkAnalysisRequest extends BaseOptions {
  original: File
  marked: File
  watermark?: File
  height?: number
  width?: number
  strength: number
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

export interface FilterPlaygroundResult {
  filtered: ArtifactResult
  inputSpectrum: ArtifactResult
  filteredSpectrum: ArtifactResult
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
  /** An ordinary image, or the real component of a cipher pair. */
  input?: File
  imaginaryFile?: File
  /** Display gamma applied to the log-scaled magnitude. */
  gamma: number
}

export interface AudioAnalysisRequest extends BaseOptions {
  input: File
  frameSize: number
}

export interface AudioAnalysisResult {
  sample_rate: number
  channels: number
  samples: number
  duration_seconds: number
  rms: number
  peak: number
  waveform: number[]
  spectrum: { frequencies: number[]; magnitude: number[] }
  spectrogram: number[][]
  frame_size: number
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

export interface AudioSecurityRequest extends BaseOptions {
  original: File
  ciphertext: File
  passphrase: string
  wrongPassphrase: string
  maxPhaseError: number
  steps: number
}

export interface AudioSecurityMetrics {
  mse: number
  snr_db: number
  segmental_snr_db: number
  correlation: number
}

export interface AudioSecurityReport {
  sample_rate: number
  duration_seconds: number
  block_size: number
  channels: number
  correct_key: AudioSecurityMetrics
  wrong_key: AudioSecurityMetrics
  key_sensitivity: Array<AudioSecurityMetrics & { phase_error_rad: number; key_error_percent: number }>
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
  /** Audio ciphertext container. */
  ciphertext: File
  original: File
  passphrase: string
  level?: number
  profile?: string
}

export interface ImageAttackReportRequest extends BaseOptions {
  realFile: File
  imaginaryFile: File
  original: File
  passphrase: string
  level?: number
  profile?: string
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
  level?: number
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

export interface CipherPairResult {
  real: Artifact
  imaginary: Artifact
  bundle: Artifact
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
