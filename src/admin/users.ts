import { isProtected, type Privilege, type Role } from '@access/privileges.ts'

/* An account as the administration page sees it: who they are, what they hold,
   and enough of a count to tell a real user from an empty one. Shared with the
   server, which is what fills the counts in. */

export interface UserStats {
  readonly patches: number
  readonly arrangements: number
  readonly ratings: number
}

/* The account that decided one override, as the join found it. Raw columns:
   which of the three to show is the page's rule, and answering it here would
   put that rule in a second place. */
export interface Decider {
  readonly uid: string
  readonly name: string | null
  readonly email: string | null
}

/* One stored override with the stamp every write already puts on it. It rides
   beside `granted`/`revoked` rather than inside them, because those two go
   straight to `resolve()`, which must not learn what an audit field is. */
export interface Decided {
  readonly privilege: string
  readonly granted: boolean
  readonly at: string
  readonly by: Decider | null
}

export interface AdminUser {
  readonly uid: string
  readonly name: string | null
  readonly email: string | null
  readonly avatar: string | null
  readonly provider: string
  /* What the column holds — never `member`, which everybody is. */
  readonly roles: readonly Role[]
  /* Listed in MOOG_ADMINS. The admin role cannot be taken off them here, so the
     page draws that toggle locked rather than letting it fail. */
  readonly envAdmin: boolean
  /* After the roles and the overrides have been resolved: what they can do. */
  readonly privileges: readonly Privilege[]
  readonly granted: readonly Privilege[]
  readonly revoked: readonly Privilege[]
  /* Override rows naming a privilege this build does not know. Shown rather
     than hidden: they are somebody's decision, and a build that hid them would
     look like it had lost them. */
  readonly unknown: readonly string[]
  /* Every stored row, known name or not, with who decided it and when. */
  readonly decisions: readonly Decided[]
  readonly stats: UserStats
  readonly createdAt: string
  readonly lastSeenAt: string
}

export function displayName(user: AdminUser): string {
  return user.name ?? user.email ?? user.uid
}

/* `by_user_id` is `on delete set null`, so a null actor is both a row the
   install wrote itself and one whose author has since been deleted. Nothing
   can tell the two apart, so neither is claimed. */
export function decidedBy(by: Decider | null): string {
  return by === null ? 'who decided it is not recorded' : `by ${by.name ?? by.email ?? by.uid}`
}

/* A date rather than a timestamp: these are read down a column, and the moment
   itself rides along in a `title` for whoever wants it. */
export function when(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '—' : at.toISOString().slice(0, 10)
}

/* Matched across the three things somebody would type: what they are called,
   their address, and the id that appears in a URL. */
export function matchesUser(user: AdminUser, query: string): boolean {
  const wanted = query.trim().toLowerCase()
  if (wanted === '') return true
  return [user.name, user.email, user.uid].some(
    (field) => field !== null && field.toLowerCase().includes(wanted),
  )
}

/* Why a revoke would be refused, or null. Both reasons are the server's, and it
   still refuses them; the editor asks so it can draw a locked tick rather than
   offer a box whose only outcome is an error banner.

   Self first, matching the order the service checks in, so the tooltip says
   what the refusal would have said. The third refusal — never leaving nobody
   holding AdminUsers — is deliberately not here: it counts across every
   account, and a second copy of that count on this side is one that can
   disagree with the one inside the write's transaction. */
export function protectedReason(
  user: AdminUser,
  privilege: Privilege,
  viewerUid: string | null,
): string | null {
  if (!isProtected(privilege)) return null

  if (viewerUid !== null && user.uid === viewerUid) {
    return `This is your own account, and ${privilege} is what you would need to put it back. Another administrator can take it from you.`
  }

  if (user.envAdmin) {
    return `This address is listed in MOOG_ADMINS, which is how a locked-out install is recovered, so ${privilege} cannot be revoked from it. Take the address out of the environment and restart instead.`
  }

  return null
}
