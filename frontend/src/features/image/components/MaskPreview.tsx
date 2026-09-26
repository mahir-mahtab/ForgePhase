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
 * The mask, live, from the same formula the backend uses.
 *
 * This is a control readout rather than a result: it shows what the current
 * settings build, before anything is sent anywhere, so the filter panel is
 * usable as an instrument even with no backend attached.
 */
function MaskPreviewImpl({ params }: { params: MaskParams }) {
  // Dragging a slider fires continuously. Deferring the copy that drives the
  // plot keeps the slider thumb tracking the pointer while the rings catch up.
  const deferred = useDeferredValue(params)

  const readout = useMemo(() => {
    const profile = sampleProfile(deferred, PROFILE_STEPS)
    return {
      passed: passBandFraction(profile),
      half: halfGainRadius(profile),
    }
  }, [deferred])

  const isStale = deferred !== params

  return (
    <figure className="m-0 flex max-w-sm flex-col gap-3">
      <div
        className="transition-opacity"
        style={{ opacity: isStale ? 0.7 : 1 }}
      >
        <FrequencyPlane params={deferred} tone="image" />
      </div>

      <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
        <div className="flex items-baseline gap-2">
          <dt className="type-narrow text-xs text-muted-foreground">
            Energy kept
          </dt>
          <dd className="tabular font-mono text-xs text-image">
            {(readout.passed * 100).toFixed(1)}%
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="type-narrow text-xs text-muted-foreground">
            Half gain at
          </dt>
          <dd className="tabular font-mono text-xs text-foreground">
            {readout.half === null ? 'never' : `r ${readout.half.toFixed(2)}`}
          </dd>
        </div>
      </dl>

      <figcaption className="max-w-[52ch] text-xs text-muted-foreground">
        The gain field over the shifted spectrum, DC at the centre, with the
        same values plotted from centre to corner underneath. Computed in the
        browser from the formula the backend uses.
      </figcaption>
    </figure>
  )
}

export const MaskPreview = memo(MaskPreviewImpl)
