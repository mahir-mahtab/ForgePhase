/**
 * Demo files from the repository's `samples/` folder, served at `/samples`
 * by the Vite config, so every panel can be tried at once. Each operation has
 * its own folder there; see `samples/README.md`.
 */
export interface Sample {
  url: string
  name: string
  type: string
  /** The key a sample cipher was encrypted with, filled in when it loads. */
  passphrase?: string
}

/** The passphrase `samples/make_samples.py` encrypts every sample with. */
export const SAMPLE_PASSPHRASE = 'phaseforge-sample'

function png(folder: string, name: string, passphrase?: string): Sample {
  return { url: `/samples/${folder}/${name}`, name, type: 'image/png', passphrase }
}

function wav(folder: string, name: string, passphrase?: string): Sample {
  return { url: `/samples/${folder}/${name}`, name, type: 'audio/wav', passphrase }
}

export const SAMPLES = {
  imageEncrypt: png('image-encrypt', 'image.png'),
  imageDecrypt: png('image-decrypt', 'cipher.png', SAMPLE_PASSPHRASE),
  watermarkImage: png('watermark-embed', 'image.png'),
  watermarkMark: png('watermark-embed', 'watermark.png'),
  watermarkOriginal: png('watermark-extract', 'original.png'),
  watermarkMarked: png('watermark-extract', 'watermarked.png'),
  filter: png('filter', 'image.png'),
  hybridNear: png('hybrid', 'near.png'),
  hybridFar: png('hybrid', 'far.png'),
  imageAnalysisCipher: png('image-analysis', 'cipher.png', SAMPLE_PASSPHRASE),
  imageAnalysisOriginal: png('image-analysis', 'original.png'),
  audioEncrypt: wav('audio-encrypt', 'speech.wav'),
  audioDecrypt: wav('audio-decrypt', 'cipher.wav', SAMPLE_PASSPHRASE),
  denoise: wav('denoise', 'noisy.wav'),
  enhance: wav('enhance', 'noisy.wav'),
  audioAnalysisCipher: wav('audio-analysis', 'cipher.wav', SAMPLE_PASSPHRASE),
  audioAnalysisOriginal: wav('audio-analysis', 'original.wav'),
} as const satisfies Record<string, Sample>

export async function loadSample(sample: Sample): Promise<File> {
  const response = await fetch(sample.url)
  if (!response.ok) throw new Error(`Could not load sample ${sample.name}`)
  return new File([await response.blob()], sample.name, { type: sample.type })
}
