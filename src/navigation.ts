import { useCallback, useSyncExternalStore } from 'react'

/* No router: a handful of pages, no parameters, and a fragment already survives
   a reload and works with the back button. The moment a page takes a parameter
   this should become a real router rather than grow another special case. */

/* The pages with a tab, in the order the bar shows them. */
export const VIEWS = ['editor', 'library', 'midi'] as const

/* Administration is a page without a tab: it is reached from the account menu
   and only exists for an admin, so a tab everybody could see would be a door
   most people find locked. */
export const PAGES = [...VIEWS, 'admin'] as const
export type View = (typeof PAGES)[number]

const DEFAULT: View = 'editor'

function read(): View {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return (PAGES as readonly string[]).includes(hash) ? (hash as View) : DEFAULT
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
