import {
  effectiveRoles,
  resolve,
  type Privilege,
  type Role,
} from '@access/privileges.ts'
import { isEnvAdmin, whoAmI, type AuthConfig } from '@server/identity.ts'
import type { Repositories } from '@server/repositories/index.ts'
import type { UserRow } from '@server/repositories/users.ts'

/* Who is asking and what that lets them do. The single place a request turns
   into a set of privileges, so a route asks `can(...)` and never reasons about
   roles, admin lists or sign-in mode. */

export interface Viewer {
  readonly user: UserRow
  /* Resolved, so `member` is in here even though it is never stored. The
     account screen shows this; only the repository and the admin page see the
     column. */
  readonly roles: readonly Role[]
  readonly privileges: readonly Privilege[]
  readonly envAdmin: boolean
  can(privilege: Privilege): boolean
}

export function createAccess(repositories: Repositories, config: AuthConfig) {
  const { users } = repositories

  const listed = (user: UserRow): boolean => isEnvAdmin(user.email, config)

  const viewerOf = (user: UserRow): Viewer => {
    /* Added in memory, never written. Persisting it left the role behind after
       an address was taken out of PM_ADMINS, so the column claimed an admin
       the environment no longer named — and with overrides in play, deleting
       the revoke that masked it would have handed admin back. */
    const envAdmin = listed(user)
    const roles = effectiveRoles(users.rolesOf(user), envAdmin)
    const privileges = resolve(roles, users.overridesOf(user.id))

    return {
      user,
      roles,
      privileges,
      envAdmin,
      can: (privilege) => privileges.includes(privilege),
    }
  }

  return {
    async viewerFor(request: Request): Promise<Viewer | null> {
      const uid = await whoAmI(request, config)
      if (uid === null) return null

      const found = users.find(uid)
      return found === null ? null : viewerOf(found)
    },

    viewerOf,
    isEnvAdmin: listed,
  }
}

export type Access = ReturnType<typeof createAccess>
