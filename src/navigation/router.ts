import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
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

/* Asked before the address changes, and answers false to stop it. One at a
   time: the only thing that blocks is an unsaved draft, and two pages each
   holding something unsaved is not a state this app can be in.

   A module-level hook rather than a check at each call site, because there are
   five places that navigate and a new one would not know to ask. */
type Blocker = (to: string) => Promise<boolean>

let blocker: Blocker | null = null

export function setBlocker(next: Blocker | null): () => void {
  blocker = next
  return () => {
    if (blocker === next) blocker = null
  }
}

/* What the app believes it is showing. `popstate` arrives *after* the browser
   has already moved, so refusing one means putting this back. */
let current = '/'

/* An address bookmarked while the app kept its routes in the fragment. Rewritten
   once, before anything renders, so an old link opens the page it names rather
   than the default one. */
export function adoptLegacyHash(): void {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash !== '' && hash.startsWith('/')) window.history.replaceState(null, '', hash)
  current = read()
}

function read(): string {
  return window.location.pathname + window.location.search
}

/* The browser has already moved by the time this runs, so a refusal has to put
   the address back. That pushes an entry rather than removing one — the price
   of cancelling a Back, and better than a page whose address disagrees with
   what it is showing. */
async function onPopState(): Promise<void> {
  const to = read()
  if (to === current) return

  if (blocker !== null && !(await blocker(to))) {
    window.history.pushState(null, '', current)
    return
  }

  current = to
  announce()
}

/* Attached once, for the life of the module, rather than alongside a
   subscriber: whether Back can be refused must not depend on some component
   happening to be listening at the time. */
if (typeof window !== 'undefined') {
  current = read()
  window.addEventListener('popstate', () => void onPopState())
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

export function useLocation(): string {
  /* The server has no window, and renders whatever the default page is. */
  return useSyncExternalStore(subscribe, read, () => DEFAULT_ROUTE.path)
}

/* Async because whatever is blocking has to be allowed to ask a person, and the
   nice way to ask is a dialog rather than `window.confirm`.

   Answers whether it went, which most call sites still ignore. The one that
   cannot is opening a patch in the editor: it replaces the draft, so it has to
   happen after the move rather than before it, or a refused navigation leaves
   the old draft already gone. */
export async function navigate(path: string): Promise<boolean> {
  if (read() === path) return true
  if (blocker !== null && !(await blocker(path))) return false

  window.history.pushState(null, '', path)
  current = path
  announce()
  /* A page opened from a link starts at its top, the way a document navigation
     would. Not on `popstate`: what the browser saved for that entry is where
     somebody left the page they are going back to. */
  window.scrollTo(0, 0)
  return true
}

export function useRoute(): [Match, (path: string) => Promise<boolean>] {
  const path = useLocation()
  const go = useCallback((next: string) => navigate(next), [])
  return [resolve(path), go]
}

/* Stops a navigation while `when` holds, asking with whatever `confirm`
   resolves to. Kept in a ref so the caller can build the question inline
   without re-registering on every render. */
export function useNavigationBlock(when: boolean, confirm: () => Promise<boolean>): void {
  const latest = useRef(confirm)

  /* Written after the commit rather than during the render, so the ref is only
     ever touched where React expects it to be. */
  useEffect(() => {
    latest.current = confirm
  })

  useEffect(() => {
    if (!when) return
    return setBlocker(() => latest.current())
  }, [when])
}

/* The segments the address gave this page, under the names its path declared.
   A wrapper over what `useRoute` already returns, so a page that only wants its
   id does not have to take the route apart to find one. */
export function useParams(): Readonly<Record<string, string>> {
  return useRoute()[0].params
}
