import { useCallback, useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'

/** Versioned key: a schema change becomes a new key, not a parse failure. */
const STORAGE_KEY = 'phaseforge:theme:v1'

const listeners = new Set<() => void>()

function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme

  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // The theme still applies for this session; only persistence is lost.
  }

  for (const listener of listeners) listener()
}

/**
 * Reads the theme the pre-paint script in `index.html` already committed to the
 * DOM, so there is never a frame showing the wrong one.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'dark' as const)

  const toggleTheme = useCallback(() => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark')
  }, [])

  return { theme, toggleTheme }
}
