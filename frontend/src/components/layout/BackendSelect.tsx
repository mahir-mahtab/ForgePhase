import { Cpu } from 'lucide-react'
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
const BACKENDS: ReadonlyArray<{
  value: TransformBackend
  label: string
  hint: string
}> = [
  { value: 'numpy', label: 'NumPy', hint: 'Vectorised reference FFT' },
  { value: 'custom', label: 'Custom', hint: 'Hand-written radix-2 FFT' },
]

function BackendSelectImpl({ value, onChange }: BackendSelectProps) {
  // Derived during render: the trigger shows only the label, while the menu
  // keeps the longer hint. Letting SelectValue fall back to the item content
  // would put two lines in the trigger and overflow narrow headers.
  const activeLabel =
    BACKENDS.find((backend) => backend.value === value)?.label ?? value

  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as TransformBackend)}
    >
      <SelectTrigger className="w-32 sm:w-36" aria-label="DFT backend">
        <Cpu className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <SelectValue>{activeLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {BACKENDS.map((backend) => (
          <SelectItem key={backend.value} value={backend.value}>
            <span className="flex flex-col">
              <span className="font-medium">{backend.label}</span>
              <span className="text-xs text-muted-foreground">
                {backend.hint}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export const BackendSelect = memo(BackendSelectImpl)
