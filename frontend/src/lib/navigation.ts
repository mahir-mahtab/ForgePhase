import {
  Activity,
  AudioLines,
  Image,
  Lock,
  ScanFace,
  LockOpen,
  type LucideIcon,
  SlidersHorizontal,
  Sparkles,
  Stamp,
  Waves,
} from 'lucide-react'

import type { DomainKind } from '@/services/types'

export interface ToolItem<T extends string = string> {
  value: T
  label: string
  icon: LucideIcon
  /** One line under the page title. */
  description: string
}

export const IMAGE_TOOLS = [
  {
    value: 'encrypt',
    label: 'Encrypt',
    icon: Lock,
    description: 'Scramble an image with double random phase encoding, keyed by a passphrase or a key file.',
  },
  {
    value: 'decrypt',
    label: 'Decrypt',
    icon: LockOpen,
    description: 'Rebuild both masks from your key and reverse the transform.',
  },
  {
    value: 'watermark',
    label: 'Watermark',
    icon: Stamp,
    description: 'Hide a mark in the magnitude spectrum, then extract it again.',
  },
  {
    value: 'filter',
    label: 'Filter',
    icon: SlidersHorizontal,
    description: 'Apply a radial gain mask to the spectrum and transform back.',
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    icon: ScanFace,
    description: 'Blend two images into one that reads as the first up close and the second from afar.',
  },
  {
    value: 'analysis',
    label: 'Analysis',
    icon: Activity,
    description: 'Measure how the cipher survives damage, and how it breaks under key reuse.',
  },
] as const satisfies ReadonlyArray<ToolItem>

export const AUDIO_TOOLS = [
  {
    value: 'encrypt',
    label: 'Encrypt',
    icon: Lock,
    description: 'Encrypt a recording block by block, keyed by a passphrase or a key file.',
  },
  {
    value: 'decrypt',
    label: 'Decrypt',
    icon: LockOpen,
    description: 'Turn the noisy encrypted WAV back into the original recording.',
  },
  {
    value: 'denoise',
    label: 'Denoise',
    icon: Waves,
    description: 'Track the noise through a recording and suppress it with the OM-LSA estimator.',
  },
  {
    value: 'enhance',
    label: 'Enhance',
    icon: Sparkles,
    description: 'Two-step noise reduction with harmonic regeneration, clarity EQ and levelling.',
  },
  {
    value: 'analysis',
    label: 'Analysis',
    icon: Activity,
    description: 'Damage the encrypted audio and score how well it still decrypts.',
  },
] as const satisfies ReadonlyArray<ToolItem>

export type ImageTool = (typeof IMAGE_TOOLS)[number]['value']
export type AudioTool = (typeof AUDIO_TOOLS)[number]['value']

export const SECTIONS: ReadonlyArray<{
  id: DomainKind
  label: string
  icon: LucideIcon
  tools: ReadonlyArray<ToolItem>
}> = [
  { id: 'image', label: 'Image', icon: Image, tools: IMAGE_TOOLS },
  { id: 'audio', label: 'Audio', icon: AudioLines, tools: AUDIO_TOOLS },
]

