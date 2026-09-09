import { useEffect, useState } from 'react'

/**
 * A blob URL for a picked file, revoked when the file changes or the component
 * unmounts. Skipping the revoke leaks the whole file for the page's lifetime,
 * which matters here because the inputs are images and audio.
 *
 * The blob registry is an external system with a create/destroy lifecycle, so
 * an effect is the right tool even though it costs one extra render: deriving
 * the URL during render instead would either allocate a fresh URL on every
 * StrictMode double-invoke, or leave a revoked URL behind when the effect
 * remounts in development.
 */
export function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      // oxlint-disable-next-line set-state-in-effect -- clearing an external resource
      setUrl(null)
      return
    }

    const next = URL.createObjectURL(file)
    // oxlint-disable-next-line set-state-in-effect -- publishing the created URL
    setUrl(next)

    return () => {
      URL.revokeObjectURL(next)
    }
  }, [file])

  return url
}
