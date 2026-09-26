import { useLayoutEffect, useRef } from 'react'

/**
 * Keeps the newest value in a ref.
 *
 * Lets a callback read a fresh prop without listing it as a dependency, so the
 * callback identity stays stable and every memoized child below it stops
 * re-rendering on each parent render.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value)

  // Layout effect, not effect: the ref is current before anything can read it
  // in a paint-blocking handler.
  useLayoutEffect(() => {
    ref.current = value
  })

  return ref
}
