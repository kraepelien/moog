import { useCallback, useEffect, useState } from 'react'

/* Who the app thinks you are. One call, asked before anything is drawn, so a
   signed-out visitor never sees an editor they are not allowed to use. */

export interface Session {
  readonly mode: 'off' | 'oauth'
  readonly signedIn: boolean
  readonly admin: boolean
  readonly user: { uid: string; name: string | null; avatar: string | null } | null
}

export const SIGNED_OUT: Session = { mode: 'oauth', signedIn: false, admin: false, user: null }

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
