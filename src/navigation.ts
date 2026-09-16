import { useCallback, useSyncExternalStore } from 'react'

/* Which page the app is on, kept in the URL fragment.
 *
 * No router: there are two pages and no parameters, and a fragment is enough to
 * make them linkable, survive a reload, and work with the back button — which
 * is the whole of what a router would be doing here. The moment a page takes a
 * parameter, this should become a real one rather than grow another special
 * case. */

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
  /* Server snapshot is the default rather than a throw, so the hook is safe in
     a test renderer that has no window until it does. */
  const view = useSyncExternalStore(subscribe, read, () => DEFAULT)
  const go = useCallback((next: View) => {
    window.location.hash = `#/${next}`
  }, [])
  return [view, go]
}
