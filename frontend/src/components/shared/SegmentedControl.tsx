import { cn } from '@/lib/utils'

interface SegmentedControlProps<T extends string> {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  disabled?: boolean
}

/** A small single-choice button group; a radio group in accessibility terms. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex w-fit rounded-full border border-border bg-secondary p-0.5"
    >
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'focus-ring rounded-full px-3 py-1 text-sm font-medium transition-colors disabled:opacity-50',
              isActive
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
