import { useCallback, useSyncExternalStore } from 'react'

/* No router: two pages, no parameters, and a fragment already survives a reload
   and works with the back button. The moment a page takes a parameter this
   should become a real router rather than grow another special case. */

export const VIEWS = ['editor', 'library'] as const
export type View = (typeof VIEWS)[number]

const DEFAULT: View = 'editor'

function read(): View {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return (VIEWS as readonly string[]).includes(hash) ? (hash as View) : DEFAULT
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useView(): [View, (view: View) => void] {
  const view = useSyncExternalStore(subscribe, read, () => DEFAULT)
  const go = useCallback((next: View) => {
    window.location.hash = `#/${next}`
  }, [])
  return [view, go]
}
