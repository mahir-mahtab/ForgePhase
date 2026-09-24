import { type ReactNode, useCallback, useState } from 'react'

import { WorkspaceHeader } from '@/components/shared/WorkspaceHeader'
import { AudioDecryptPanel } from '@/features/audio/components/AudioDecryptPanel'
import { AudioEncryptPanel } from '@/features/audio/components/AudioEncryptPanel'
import { AudioRobustnessPanel } from '@/features/audio/components/AudioRobustnessPanel'
import { DenoisePanel } from '@/features/audio/components/DenoisePanel'
import { EnhancePanel } from '@/features/audio/components/EnhancePanel'
import type { AudioTool } from '@/lib/navigation'
import type { TransformBackend } from '@/services/types'

/** Keeps a tool mounted while hidden, so its inputs and results survive navigation. */
function ToolPanel({ active, children }: { active: boolean; children: ReactNode }) {
  return <div hidden={!active}>{children}</div>
}

interface Props {
  backend: TransformBackend
  tool: AudioTool
  onToolChange: (tool: AudioTool) => void
}

export default function AudioWorkspace({ backend, tool, onToolChange }: Props) {
  // Decrypt input lives here so the encrypt result can hand its cipher WAV over.
  const [container, setContainer] = useState<File | null>(null)

  const openInDecrypt = useCallback((file: File) => {
    setContainer(file)
    onToolChange('decrypt')
  }, [onToolChange])

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHeader section="audio" tool={tool} />

      <ToolPanel active={tool === 'encrypt'}>
        <AudioEncryptPanel backend={backend} onOpenInDecrypt={openInDecrypt} />
      </ToolPanel>
      <ToolPanel active={tool === 'decrypt'}>
        <AudioDecryptPanel
          backend={backend}
          container={container}
          onContainerChange={setContainer}
        />
      </ToolPanel>
      <ToolPanel active={tool === 'denoise'}>
        <DenoisePanel backend={backend} />
      </ToolPanel>
      <ToolPanel active={tool === 'enhance'}>
        <EnhancePanel backend={backend} />
      </ToolPanel>
      <ToolPanel active={tool === 'analysis'}>
        <AudioRobustnessPanel backend={backend} />
      </ToolPanel>
    </div>
  )
}
