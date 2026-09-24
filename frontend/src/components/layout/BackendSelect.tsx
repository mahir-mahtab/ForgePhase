import { memo } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TransformBackend } from '@/services/types'

interface BackendSelectProps {
  value: TransformBackend
  onChange: (value: TransformBackend) => void
}

/** Matches `transform.available_backends()` on the Python side. */
const BACKENDS: ReadonlyArray<{ value: TransformBackend; label: string; hint: string }> = [
  { value: 'numpy', label: 'NumPy', hint: 'Fast reference FFT' },
  { value: 'custom', label: 'Custom', hint: 'Hand-written radix-2 + Bluestein FFT' },
]

function BackendSelectImpl({ value, onChange }: BackendSelectProps) {
  const activeLabel = BACKENDS.find((backend) => backend.value === value)?.label ?? value

  return (
    <Select value={value} onValueChange={(next) => onChange(next as TransformBackend)}>
      <SelectTrigger className="h-9 w-full gap-1.5 rounded-full" aria-label="FFT implementation">
        <span className="text-muted-foreground">FFT backend</span>
        <span className="ml-auto font-medium">
          <SelectValue>{activeLabel}</SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent align="end">
        {BACKENDS.map((backend) => (
          <SelectItem key={backend.value} value={backend.value}>
            <span className="flex flex-col">
              <span>{backend.label}</span>
              <span className="text-xs text-muted-foreground">{backend.hint}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export const BackendSelect = memo(BackendSelectImpl)
