import { useCallback, useSyncExternalStore } from 'react'
import { DEFAULT_ROUTE, resolve, type Match } from './routes.ts'

/* The address, read from the path and written back to it.

   `pushState` does not fire an event of its own, so writing one has to tell the
   store; `popstate` covers the back and forward buttons. Both go through the
   same listener set, which is what keeps a programmatic navigation and a press
   of Back indistinguishable to anything reading this.

   Serving this needs the server to hand back the app for an address it does not
   recognise, which `server/serve.ts` already does — "anything else is a client
   route" — and Vite does in development. */

const listeners = new Set<() => void>()

function announce(): void {
  for (const listener of listeners) listener()
}

/* An address bookmarked while the app kept its routes in the fragment. Rewritten
   once, before anything renders, so an old link opens the page it names rather
   than the default one. */
export function adoptLegacyHash(): void {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash === '' || !hash.startsWith('/')) return
  window.history.replaceState(null, '', hash)
}

function read(): string {
  return window.location.pathname + window.location.search
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  window.addEventListener('popstate', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('popstate', onChange)
  }
}

export function useLocation(): string {
  /* The server has no window, and renders whatever the default page is. */
  return useSyncExternalStore(subscribe, read, () => DEFAULT_ROUTE.path)
}

export function navigate(path: string): void {
  if (read() === path) return
  window.history.pushState(null, '', path)
  announce()
}

export function useRoute(): [Match, (path: string) => void] {
  const path = useLocation()
  /* `navigate` is a module function and already stable, so this only exists to
     hand call sites the same reference every render. */
  const go = useCallback((next: string) => navigate(next), [])
  return [resolve(path), go]
}

/* The segments the address gave this page, under the names its path declared.
   A wrapper over what `useRoute` already returns, so a page that only wants its
   id does not have to take the route apart to find one. */
export function useParams(): Readonly<Record<string, string>> {
  return useRoute()[0].params
}
