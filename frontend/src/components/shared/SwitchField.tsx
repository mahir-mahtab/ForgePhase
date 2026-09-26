import { memo, useId } from 'react'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface SwitchFieldProps {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

/** A labelled on/off option, laid out like the other form fields. */
function SwitchFieldImpl({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
}: SwitchFieldProps) {
  const id = useId()
  const hintId = useId()

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        <p id={hintId} className="mt-0.5 text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={hintId}
      />
    </div>
  )
}

export const SwitchField = memo(SwitchFieldImpl)
