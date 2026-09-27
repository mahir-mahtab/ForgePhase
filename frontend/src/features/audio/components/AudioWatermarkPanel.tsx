import { type WatermarkConfig, WatermarkTool } from '@/components/shared/WatermarkTool'
import { ACCEPT_AUDIO } from '@/lib/accept'
import { SAMPLES } from '@/lib/samples'
import { embedAudioWatermark, extractAudioWatermark } from '@/services/audioService'

const AUDIO_WATERMARK: WatermarkConfig = {
  kind: 'audio',
  accept: ACCEPT_AUDIO,
  command: 'audio-watermark',
  ext: 'wav',
  embed: embedAudioWatermark,
  extract: extractAudioWatermark,
  labels: { carrier: 'Recording', mark: 'Watermark clip' },
  markHint: 'Up to ¼ of the recording.',
  embedHint: 'The watermarked recording appears here. It should sound the same as the original.',
  extractHint: 'The recovered clip appears here.',
  samples: {
    carrier: SAMPLES.audioWatermarkHost,
    mark: SAMPLES.audioWatermarkMark,
    original: SAMPLES.audioWatermarkOriginal,
    marked: SAMPLES.audioWatermarkMarked,
  },
}

export function AudioWatermarkPanel() {
  return <WatermarkTool config={AUDIO_WATERMARK} />
}
