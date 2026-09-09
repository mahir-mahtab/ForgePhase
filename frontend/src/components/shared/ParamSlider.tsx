import { memo, useCallback, useId } from 'react'

import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'

interface ParamSliderProps {
  label: string
  description?: string
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  onChange: (value: number) => void
  /** Decimals shown in the readout; defaults to the step's own precision. */
  precision?: number
  unit?: string
}

function decimalsOf(step: number) {
  const text = String(step)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

function ParamSliderImpl({
  label,
  description,
  value,
  min,
  max,
  step,
  disabled = false,
  onChange,
  precision,
  unit,
}: ParamSliderProps) {
  const id = useId()
  // Derived during render -- cheap arithmetic does not belong in state.
  const decimals = precision ?? decimalsOf(step)

  const handleChange = useCallback(
    (next: number[]) => {
      const first = next[0]
      if (first !== undefined) onChange(first)
    },
    [onChange],
  )

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <output
          htmlFor={id}
          className="tabular rounded-md bg-secondary px-2 py-0.5 font-mono text-xs text-secondary-foreground"
        >
          {value.toFixed(decimals)}
          {unit ? <span className="text-muted-foreground"> {unit}</span> : null}
        </output>
      </div>

      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={handleChange}
        aria-label={label}
      />

      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

export const ParamSlider = memo(ParamSliderImpl)
