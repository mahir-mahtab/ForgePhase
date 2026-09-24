import { type ReactNode, useCallback, useState } from 'react'

import { WorkspaceHeader } from '@/components/shared/WorkspaceHeader'
import { AudioDecryptPanel } from '@/features/audio/components/AudioDecryptPanel'
import { AudioEncryptPanel } from '@/features/audio/components/AudioEncryptPanel'
import { AudioRobustnessPanel } from '@/features/audio/components/AudioRobustnessPanel'
import { DenoisePanel } from '@/features/audio/components/DenoisePanel'
import { EnhancePanel } from '@/features/audio/components/EnhancePanel'
import type { AudioTool } from '@/lib/navigation'

/** Keeps a tool mounted while hidden, so its inputs and results survive navigation. */
function ToolPanel({ active, children }: { active: boolean; children: ReactNode }) {
  return <div hidden={!active}>{children}</div>
}

interface Props {
  tool: AudioTool
  onToolChange: (tool: AudioTool) => void
}

export default function AudioWorkspace({ tool, onToolChange }: Props) {
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
        <AudioEncryptPanel onOpenInDecrypt={openInDecrypt} />
      </ToolPanel>
      <ToolPanel active={tool === 'decrypt'}>
        <AudioDecryptPanel
          container={container}
          onContainerChange={setContainer}
        />
      </ToolPanel>
      <ToolPanel active={tool === 'denoise'}>
        <DenoisePanel />
      </ToolPanel>
      <ToolPanel active={tool === 'enhance'}>
        <EnhancePanel />
      </ToolPanel>
      <ToolPanel active={tool === 'analysis'}>
        <AudioRobustnessPanel />
      </ToolPanel>
    </div>
  )
}
