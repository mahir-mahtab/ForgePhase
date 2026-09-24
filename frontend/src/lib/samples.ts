/** Demo files shipped in `public/samples`, so every panel can be tried at once. */
export interface Sample {
  url: string
  name: string
  type: string
}

export const SAMPLES = {
  image: { url: '/samples/test.png', name: 'test.png', type: 'image/png' },
  watermark: { url: '/samples/watermark.png', name: 'watermark.png', type: 'image/png' },
  speechNoisy: { url: '/samples/speech_noisy.wav', name: 'speech_noisy.wav', type: 'audio/wav' },
  speechClean: { url: '/samples/speech_clean.wav', name: 'speech_clean.wav', type: 'audio/wav' },
} as const satisfies Record<string, Sample>

export async function loadSample(sample: Sample): Promise<File> {
  const response = await fetch(sample.url)
  if (!response.ok) throw new Error(`Could not load sample ${sample.name}`)
  return new File([await response.blob()], sample.name, { type: sample.type })
}
