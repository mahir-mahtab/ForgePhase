import { memo, useDeferredValue, useMemo } from 'react'

import { FrequencyPlane } from '@/components/shared/FrequencyPlane'
import {
  type MaskParams,
  halfGainRadius,
  passBandFraction,
  sampleProfile,
} from '@/lib/mask'

/** Readout resolution. Finer than the drawn rings; still trivially cheap. */
const PROFILE_STEPS = 256

/**
 * The mask, live, from the same formula the backend uses -- so the effect of
 * each setting is visible before anything is sent.
 */
function MaskPreviewImpl({ params }: { params: MaskParams }) {
  // Dragging a slider fires continuously. Deferring the copy that drives the
  // plot keeps the slider thumb tracking the pointer while the rings catch up.
  const deferred = useDeferredValue(params)

  const readout = useMemo(() => {
    const profile = sampleProfile(deferred, PROFILE_STEPS)
    return { passed: passBandFraction(profile), half: halfGainRadius(profile) }
  }, [deferred])

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="text-sm font-medium">Filter mask preview</figcaption>
      <div
        className="mx-auto w-full max-w-64 transition-opacity"
        style={{ opacity: deferred !== params ? 0.7 : 1 }}
      >
        <FrequencyPlane params={deferred} />
      </div>
      <p className="text-xs text-muted-foreground">
        Passes about{' '}
        <span className="tabular font-medium text-foreground">
          {(readout.passed * 100).toFixed(0)}%
        </span>{' '}
        of the spectrum
        {readout.half === null ? '' : `, half gain at radius ${readout.half.toFixed(2)}`}.
      </p>
    </figure>
  )
}

export const MaskPreview = memo(MaskPreviewImpl)
