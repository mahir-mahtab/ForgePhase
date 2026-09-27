import {
  AudioLines,
  ChartScatter,
  Gauge,
  Image,
  Lock,
  LockOpen,
  type LucideIcon,
  ScanFace,
  ShieldCheck,
  ShieldLock,
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
    description: 'Encrypt an image with a passphrase or key file.',
  },
  {
    value: 'decrypt',
    label: 'Decrypt',
    icon: LockOpen,
    description: 'Restore the image using your key.',
  },
  {
    value: 'watermark',
    label: 'Watermark',
    icon: Stamp,
    description: 'Embed and extract a hidden mark.',
  },
  {
    value: 'filter',
    label: 'Filter',
    icon: SlidersHorizontal,
    description: 'Shape the spectrum with a radial mask.',
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    icon: ScanFace,
    description: 'Blend two images by viewing distance.',
  },
  {
    value: 'analysis',
    label: 'Analysis',
    icon: ChartScatter,
    description: 'Test robustness and key-reuse attacks.',
  },
] as const satisfies ReadonlyArray<ToolItem>

export const AUDIO_TOOLS = [
  {
    value: 'encrypt',
    label: 'Encrypt',
    icon: ShieldLock,
    description: 'Encrypt a recording with a passphrase or key file.',
  },
  {
    value: 'decrypt',
    label: 'Decrypt',
    icon: ShieldCheck,
    description: 'Restore the original recording.',
  },
  {
    value: 'watermark',
    label: 'Watermark',
    icon: Stamp,
    description: 'Hide a short clip and extract it again.',
  },
  {
    value: 'denoise',
    label: 'Denoise',
    icon: Waves,
    description: 'Remove background noise.',
  },
  {
    value: 'enhance',
    label: 'Enhance',
    icon: Sparkles,
    description: 'Clean up and sharpen speech.',
  },
  {
    value: 'analysis',
    label: 'Analysis',
    icon: Gauge,
    description: 'Test how well damaged audio decrypts.',
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

export interface SearchResult {
  domain: DomainKind
  domainLabel: string
  tool: ToolItem
}

/** Search tools by label, description, or domain name. */
export function searchTools(query: string, sections = SECTIONS): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const results: SearchResult[] = []
  for (const group of sections) {
    for (const tool of group.tools) {
      if (
        tool.label.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        group.label.toLowerCase().includes(q)
      ) {
        results.push({ domain: group.id, domainLabel: group.label, tool })
      }
    }
  }
  return results
}


