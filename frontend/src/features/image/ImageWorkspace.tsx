import { useCallback, useState } from 'react'

import { ToolPanel } from '@/components/shared/ToolPanel'
import { WorkspaceHeader } from '@/components/shared/WorkspaceHeader'
import { FilterPanel } from '@/features/image/components/FilterPanel'
import { HybridPanel } from '@/features/image/components/HybridPanel'
import { ImageDecryptPanel } from '@/features/image/components/ImageDecryptPanel'
import { ImageEncryptPanel } from '@/features/image/components/ImageEncryptPanel'
import { ImageRobustnessPanel } from '@/features/image/components/ImageRobustnessPanel'
import { KeyReuseAttackPanel } from '@/features/image/components/KeyReuseAttackPanel'
import { WatermarkPanel } from '@/features/image/components/WatermarkPanel'
import type { ImageTool } from '@/lib/navigation'

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
      <ToolPanel active={tool === 'hybrid'}>
        <HybridPanel />
      </ToolPanel>
      <ToolPanel active={tool === 'analysis'}>
        <ImageRobustnessPanel />
        <KeyReuseAttackPanel />
      </ToolPanel>
    </div>
  )
}
