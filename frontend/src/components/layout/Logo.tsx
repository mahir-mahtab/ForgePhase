/**
 * Two sine waves half a period apart, crossing where they meet: a signal and
 * its phase-shifted twin, which is the whole idea of the toolkit.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M4 16c3-9 5-9 8 0s5 9 8 0 5-9 8 0"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="stroke-primary-foreground"
        strokeOpacity="0.45"
      />
      <path
        d="M4 16c3 9 5 9 8 0s5-9 8 0 5 9 8 0"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="stroke-primary-foreground"
      />
    </svg>
  )
}
