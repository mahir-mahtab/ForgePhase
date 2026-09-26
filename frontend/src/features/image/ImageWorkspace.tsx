import {
  BarChart3,
  KeyRound,
  Lock,
  ScanSearch,
  ShieldAlert,
  SlidersHorizontal,
  Unlock,
  Waves,
} from 'lucide-react'

import { RobustnessPanel } from '@/components/shared/RobustnessPanel'
import { ChannelHeader } from '@/components/shared/ChannelHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FilterPanel } from '@/features/image/components/FilterPanel'
import { ImageDecryptPanel } from '@/features/image/components/ImageDecryptPanel'
import { ImageEncryptPanel } from '@/features/image/components/ImageEncryptPanel'
import { SpectrumPanel } from '@/features/image/components/SpectrumPanel'
import { WatermarkPanel } from '@/features/image/components/WatermarkPanel'
import { SecurityAnalysisPanel } from '@/features/image/components/SecurityAnalysisPanel'
import { DrpeSecurityLabPanel } from '@/features/image/components/DrpeSecurityLabPanel'
import { KeySensitivityPanel } from '@/features/image/components/KeySensitivityPanel'
import { ResultsDashboardPanel } from '@/features/image/components/ResultsDashboardPanel'
import { ACCEPT_IMAGE } from '@/lib/accept'
import { imageRobustnessReport } from '@/services/imageService'
import type { TransformBackend } from '@/services/types'

/** Nameplate specs. Constant, so the memoized header never re-renders. */
const SPECS = [
  { term: 'Transform', value: '2D FFT' },
  { term: 'Cipher', value: 'DRPE, two masks' },
  { term: 'Cipher output', value: 'real + imaginary PNG' },
  { term: 'Known break', value: 'chosen-plaintext' },
] as const

const TABS = [
  { value: 'encrypt', label: 'Encrypt', icon: <Lock aria-hidden /> },
  { value: 'decrypt', label: 'Decrypt', icon: <Unlock aria-hidden /> },
  { value: 'watermark', label: 'Watermark', icon: <ScanSearch aria-hidden /> },
  { value: 'filter', label: 'Filter', icon: <SlidersHorizontal aria-hidden /> },
  { value: 'spectrum', label: 'Spectrum', icon: <Waves aria-hidden /> },
  { value: 'sensitivity', label: 'Key sensitivity', icon: <KeyRound aria-hidden /> },
  { value: 'analysis', label: 'Security analysis', icon: <ShieldAlert aria-hidden /> },
  { value: 'drpe-lab', label: 'DRPE Lab', icon: <Lock aria-hidden /> },
  { value: 'results', label: 'Results dashboard', icon: <BarChart3 aria-hidden /> },
  {
    value: 'robustness',
    label: 'Robustness',
    icon: <ShieldAlert aria-hidden />,
  },
] as const

export default function ImageWorkspace({
  backend,
}: {
  backend: TransformBackend
}) {
  return (
    <div className="flex flex-col gap-8">
      <ChannelHeader
        channel="ch1"
        tone="image"
        title="Fourier-domain image security"
        lede="Everything on this channel runs over the 2D FFT. Encrypt an image into a complex ciphertext, hide a watermark in its spectrum, reshape it with a radial filter, or just look at the spectrum."
        fieldCaption="One of the two random phase masks DRPE multiplies by."
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
          <ImageEncryptPanel backend={backend} />
        </TabsContent>

        <TabsContent value="decrypt">
          <ImageDecryptPanel backend={backend} />
        </TabsContent>

        <TabsContent value="watermark">
          <WatermarkPanel backend={backend} />
        </TabsContent>

        <TabsContent value="filter">
          <FilterPanel backend={backend} />
        </TabsContent>

        <TabsContent value="spectrum">
          <SpectrumPanel backend={backend} />
        </TabsContent>

        <TabsContent value="analysis">
          <SecurityAnalysisPanel backend={backend} />
        </TabsContent>

        <TabsContent value="drpe-lab">
          <DrpeSecurityLabPanel backend={backend} />
        </TabsContent>

        <TabsContent value="sensitivity">
          <KeySensitivityPanel />
        </TabsContent>


        <TabsContent value="results">
          <ResultsDashboardPanel backend={backend} />
        </TabsContent>

        <TabsContent value="robustness">
          <RobustnessPanel
            tone="image"
            originalAccept={ACCEPT_IMAGE}
            originalKind="image"
            originalLabel="Original image"
            run={imageRobustnessReport}
            backend={backend}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
