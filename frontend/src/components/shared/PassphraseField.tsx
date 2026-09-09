import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { memo, useCallback, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Twelve bullets: a fixed-width hint that never reveals a real length. */
const DOT_PLACEHOLDER = "•".repeat(12)

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
  hint = 'Derives both random-phase masks. Never stored, never sent anywhere yet.',
  disabled = false,
}: PassphraseFieldProps) {
  const id = useId()
  const [isVisible, setIsVisible] = useState(false)

  // Functional update: the callback never needs `isVisible` as a dependency,
  // so its identity stays stable across renders.
  const toggleVisible = useCallback(() => {
    setIsVisible((previous) => !previous)
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        <KeyRound className="size-3.5 text-muted-foreground" aria-hidden />
        {label}
      </Label>

      <div className="relative">
        <Input
          id={id}
          type={isVisible ? 'text' : 'password'}
          value={value}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          placeholder={DOT_PLACEHOLDER}
          className="pr-10 font-mono"
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
          {isVisible ? (
            <EyeOff className="size-4" />
          ) : (
            <Eye className="size-4" />
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

export const PassphraseField = memo(PassphraseFieldImpl)
