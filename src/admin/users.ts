import type { Privilege, Role } from '../access/privileges.ts'

/* An account as the administration page sees it: who they are, what they hold,
   and enough of a count to tell a real user from an empty one. Shared with the
   server, which is what fills the counts in. */

export interface UserStats {
  readonly patches: number
  readonly arrangements: number
  readonly ratings: number
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
  readonly stats: UserStats
  readonly createdAt: string
  readonly lastSeenAt: string
}

export function displayName(user: AdminUser): string {
  return user.name ?? user.email ?? user.uid
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
