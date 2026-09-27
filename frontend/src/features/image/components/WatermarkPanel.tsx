import { type WatermarkConfig, WatermarkTool } from '@/components/shared/WatermarkTool'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { SAMPLES } from '@/lib/samples'
import { embedWatermark, extractWatermark } from '@/services/imageService'

const IMAGE_WATERMARK: WatermarkConfig = {
  kind: 'image',
  accept: ACCEPT_IMAGE,
  command: 'watermark',
  ext: 'png',
  embed: embedWatermark,
  extract: extractWatermark,
  labels: { carrier: 'Image', mark: 'Watermark' },
  markHint: 'Any size, colour or grey.',
  embedHint: 'The watermarked image appears here. It should look almost identical to the original.',
  extractHint: 'The recovered watermark appears here, contrast-stretched for display.',
  samples: {
    carrier: SAMPLES.watermarkImage,
    mark: SAMPLES.watermarkMark,
    original: SAMPLES.watermarkOriginal,
    marked: SAMPLES.watermarkMarked,
  },
}

export function WatermarkPanel() {
  return <WatermarkTool config={IMAGE_WATERMARK} />
}
