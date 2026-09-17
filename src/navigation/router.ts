import { useCallback, useSyncExternalStore } from 'react'
import { DEFAULT_ROUTE, resolve, type Match } from './routes.ts'

/* The address, read from the fragment and written back to it. */

function read(): string {
  return window.location.hash.replace(/^#/, '') || DEFAULT_ROUTE.path
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useLocation(): string {
  /* The server has no window, and renders whatever the default page is. */
  return useSyncExternalStore(subscribe, read, () => DEFAULT_ROUTE.path)
}

export function useRoute(): [Match, (path: string) => void] {
  const path = useLocation()
  const go = useCallback((next: string) => {
    window.location.hash = `#${next}`
  }, [])
  return [resolve(path), go]
}
