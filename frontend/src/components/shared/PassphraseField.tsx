import { Eye, EyeOff } from 'lucide-react'
import { memo, useCallback, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PassphraseFieldProps {
  value: string
  onChange: (value: string) => void
  label?: string
  hint?: string
  disabled?: boolean
}

function PassphraseFieldImpl({
  value,
  onChange,
  label = 'Passphrase',
  hint = 'Both random-phase masks are derived from this. It is sent to your local backend and never stored.',
  disabled = false,
}: PassphraseFieldProps) {
  const id = useId()
  const hintId = useId()
  const [isVisible, setIsVisible] = useState(false)

  const toggleVisible = useCallback(() => {
    setIsVisible((previous) => !previous)
  }, [])

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={isVisible ? 'text' : 'password'}
          value={value}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={hintId}
          className="pr-10"
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          onClick={toggleVisible}
          aria-label={isVisible ? 'Hide passphrase' : 'Show passphrase'}
          className="absolute top-0.5 right-0.5"
        >
          {isVisible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  )
}

export const PassphraseField = memo(PassphraseFieldImpl)
