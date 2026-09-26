/**
 * Coordinates are kept to whole and half units: shorter path data, and the
 * shape is identical once rasterized at the sizes this actually renders at.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="PhaseForge"
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M6 22c3 0 3-12 6-12s3 12 6 12 3-12 6-12"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="stroke-image"
      />
      <circle cx="16" cy="16" r="2.5" className="fill-audio" />
    </svg>
  )
}
