import { useCallback, useEffect, useState } from 'react'

/* Who the app thinks you are. One call, asked before anything is drawn, so a
   signed-out visitor never sees an editor they are not allowed to use. */

export interface Session {
  readonly mode: 'off' | 'oauth'
  readonly signedIn: boolean
  /* What this account may do, as the server sees it. Roles come along for the
     account screen to show; nothing decides from them, because which role
     grants what is the server's to know. */
  readonly roles: readonly string[]
  readonly privileges: readonly string[]
  readonly user: { uid: string; name: string | null; avatar: string | null } | null
}

export const SIGNED_OUT: Session = {
  mode: 'oauth',
  signedIn: false,
  roles: [],
  privileges: [],
  user: null,
}

/* Where signing in comes back to. The *address*, never the route's declared
   path: a route that takes a parameter is written `/patch/:id`, and returning
   to that literally asks for a patch called ":id" and lands on the default page
   instead. `safeReturnTo` on the server cannot catch it either, since it is a
   path like any other.

   The query goes with it: a failed attempt arrives back carrying `?error=`, and
   that belongs to the page that reads it rather than to the next round trip. */
export function returnToFor(address: string): string {
  return address.split(/[?#]/)[0] || '/'
}

export function signInHref(returnTo: string): string {
  return `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`
}

export async function fetchSession(doFetch: typeof fetch = fetch): Promise<Session> {
  const response = await doFetch('/api/session', { credentials: 'same-origin' })
  if (!response.ok) return SIGNED_OUT
  return (await response.json()) as Session
}

export async function signOut(doFetch: typeof fetch = fetch): Promise<void> {
  await doFetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' })
}

export function useSession(): { session: Session | null; refresh: () => void } {
  const [session, setSession] = useState<Session | null>(null)

  const refresh = useCallback(() => {
    void fetchSession()
      .then(setSession)
      /* A server that cannot be reached is not a session: the app shows the
         way in rather than an editor it cannot save from. */
      .catch(() => setSession(SIGNED_OUT))
  }, [])

  useEffect(refresh, [refresh])

  return { session, refresh }
}
