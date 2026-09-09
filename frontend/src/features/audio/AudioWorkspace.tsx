import {
  Eraser,
  Lock,
  ShieldAlert,
  Sparkles,
  Unlock,
} from 'lucide-react'

import { RobustnessPanel } from '@/components/shared/RobustnessPanel'
import { ChannelHeader } from '@/components/shared/ChannelHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AudioDecryptPanel } from '@/features/audio/components/AudioDecryptPanel'
import { AudioEncryptPanel } from '@/features/audio/components/AudioEncryptPanel'
import { DenoisePanel } from '@/features/audio/components/DenoisePanel'
import { EnhancePanel } from '@/features/audio/components/EnhancePanel'
import { ACCEPT_AUDIO } from '@/lib/accept'
import { audioRobustnessReport } from '@/services/audioService'
import type { TransformBackend } from '@/services/types'

/** Nameplate specs. Constant, so the memoized header never re-renders. */
const SPECS = [
  { term: 'Transform', value: '1D FFT per block' },
  { term: 'Cipher', value: 'DRPE, per channel' },
  { term: 'Default block', value: '4096 samples' },
  { term: 'Metrics', value: 'SNR, segmental SNR' },
] as const

const TABS = [
  { value: 'encrypt', label: 'Encrypt', icon: <Lock aria-hidden /> },
  { value: 'decrypt', label: 'Decrypt', icon: <Unlock aria-hidden /> },
  { value: 'denoise', label: 'Denoise', icon: <Eraser aria-hidden /> },
  { value: 'enhance', label: 'Enhance', icon: <Sparkles aria-hidden /> },
  {
    value: 'robustness',
    label: 'Robustness',
    icon: <ShieldAlert aria-hidden />,
  },
] as const

export default function AudioWorkspace({
  backend,
}: {
  backend: TransformBackend
}) {
  return (
    <div className="flex flex-col gap-8">
      <ChannelHeader
        channel="ch2"
        tone="audio"
        title="Fourier-domain audio security"
        lede="The same FFT backend as the image channel, one dimension down. Encrypt a waveform block by block, strip a steady noise floor out of a recording, or lift speech out of what is left."
        fieldCaption="Every block carries its own phase mask."
        specs={SPECS}
      />

      <Tabs defaultValue="encrypt">
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.icon}
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="encrypt">
          <AudioEncryptPanel backend={backend} />
        </TabsContent>

        <TabsContent value="decrypt">
          <AudioDecryptPanel backend={backend} />
        </TabsContent>

        <TabsContent value="denoise">
          <DenoisePanel backend={backend} />
        </TabsContent>

        <TabsContent value="enhance">
          <EnhancePanel backend={backend} />
        </TabsContent>

        <TabsContent value="robustness">
          <RobustnessPanel
            tone="audio"
            originalAccept={ACCEPT_AUDIO}
            originalKind="audio"
            originalLabel="Original audio"
            run={audioRobustnessReport}
            backend={backend}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
