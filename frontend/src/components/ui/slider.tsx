import * as SliderPrimitive from '@radix-ui/react-slider'
import { type ComponentProps, useMemo } from 'react'

import { cn } from '@/lib/utils'

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: ComponentProps<typeof SliderPrimitive.Root>) {
  // Derived during render rather than mirrored into state, and memoized so the
  // thumb array keeps a stable identity between renders.
  const thumbs = useMemo(
    () =>
      Array.isArray(value)
        ? value.length
        : Array.isArray(defaultValue)
          ? defaultValue.length
          : 1,
    [value, defaultValue],
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-primary"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="focus-ring block size-4 shrink-0 rounded-full border-2 border-primary bg-card transition-[color,box-shadow] hover:ring-4 hover:ring-primary/20 disabled:pointer-events-none"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
