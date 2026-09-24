import { type ReactNode, useCallback, useState } from 'react'

import { WorkspaceHeader } from '@/components/shared/WorkspaceHeader'
import { FilterPanel } from '@/features/image/components/FilterPanel'
import { ImageDecryptPanel } from '@/features/image/components/ImageDecryptPanel'
import { ImageEncryptPanel } from '@/features/image/components/ImageEncryptPanel'
import { ImageRobustnessPanel } from '@/features/image/components/ImageRobustnessPanel'
import { KpaDemoPanel } from '@/features/image/components/KpaDemoPanel'
import { SpectrumPanel } from '@/features/image/components/SpectrumPanel'
import { WatermarkPanel } from '@/features/image/components/WatermarkPanel'
import type { ImageTool } from '@/lib/navigation'

/** Keeps a tool mounted while hidden, so its inputs and results survive navigation. */
function ToolPanel({ active, children }: { active: boolean; children: ReactNode }) {
  return <div hidden={!active}>{children}</div>
}

interface Props {
  tool: ImageTool
  onToolChange: (tool: ImageTool) => void
}

export default function ImageWorkspace({ tool, onToolChange }: Props) {
  // The decrypt input lives here so the encrypt result can hand its cipher over.
  const [cipherFile, setCipherFile] = useState<File | null>(null)

  const openInDecrypt = useCallback((cipher: File) => {
    setCipherFile(cipher)
    onToolChange('decrypt')
  }, [onToolChange])

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHeader section="image" tool={tool} />

      <ToolPanel active={tool === 'encrypt'}>
        <ImageEncryptPanel onOpenInDecrypt={openInDecrypt} />
      </ToolPanel>
      <ToolPanel active={tool === 'decrypt'}>
        <ImageDecryptPanel
          cipherFile={cipherFile}
          onCipherChange={setCipherFile}
        />
      </ToolPanel>
      <ToolPanel active={tool === 'watermark'}>
        <WatermarkPanel />
      </ToolPanel>
      <ToolPanel active={tool === 'filter'}>
        <FilterPanel />
      </ToolPanel>
      <ToolPanel active={tool === 'spectrum'}>
        <SpectrumPanel />
      </ToolPanel>
      <ToolPanel active={tool === 'analysis'}>
        <div className="flex flex-col gap-6">
          <ImageRobustnessPanel />
          <KpaDemoPanel />
        </div>
      </ToolPanel>
    </div>
  )
}
