import { useId } from 'react'

/**
 * The PF monogram: a gold P and F sharing one looping stem, on a deep teal tile.
 * Gradient ids come from `useId` so several logos on one page never collide.
 */
export function Logo({ className }: { className?: string }) {
  // Stripped to characters that are always safe inside `url(#…)`.
  const id = `pf${useId().replace(/[^\w-]/g, '')}`
  const ink = `${id}-ink`
  const bg = `${id}-bg`

  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden>
      <defs>
        <linearGradient id={ink} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#c9953f" />
          <stop offset="0.55" stopColor="#f2d492" />
          <stop offset="1" stopColor="#fff1c9" />
        </linearGradient>
        <radialGradient id={bg} cx="0.35" cy="0.3" r="0.9">
          <stop offset="0" stopColor="#16504f" />
          <stop offset="1" stopColor="#0b2e30" />
        </radialGradient>
      </defs>

      <rect width="400" height="400" rx="88" fill={`url(#${bg})`} />
      <circle cx="200" cy="200" r="158" fill="none" stroke="#f2d492" strokeOpacity="0.22" strokeWidth="1.5" />
      <circle cx="200" cy="200" r="150" fill="none" stroke="#f2d492" strokeOpacity="0.12" strokeWidth="1" />

      <g fill="none" stroke={`url(#${ink})`} strokeLinecap="round" strokeLinejoin="round">
        {/* Shared stem with a looping lead-in (P + F). */}
        <path strokeWidth="13" d="M92 318 C 70 300, 88 272, 116 290 C 140 306, 160 330, 176 300 C 190 250, 198 160, 209 66" />
        {/* F top swash with a curl. */}
        <path strokeWidth="9" d="M140 104 C 170 66, 230 52, 292 56 C 338 59, 366 72, 352 92 C 342 104, 322 94, 332 82" />
        {/* P bowl. */}
        <path strokeWidth="12" d="M206 108 C 256 86, 306 102, 300 142 C 294 182, 238 192, 194 176" />
        {/* F crossbar with a small flick. */}
        <path strokeWidth="9" d="M140 238 C 168 224, 206 222, 248 228 C 266 231, 266 248, 250 245" />
      </g>
    </svg>
  )
}
