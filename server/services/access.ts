import {
  grants,
  privilegesOf,
  ROLE,
  type Privilege,
  type Role,
} from '../../src/access/privileges.ts'
import { whoAmI, type AuthConfig } from '../identity.ts'
import type { Repositories } from '../repositories/index.ts'
import type { UserRow } from '../repositories/users.ts'

/* Who is asking and what that lets them do. The single place a request turns
   into a set of privileges, so a route asks `can(...)` and never reasons about
   roles, admin lists or sign-in mode. */

export interface Viewer {
  readonly user: UserRow
  readonly roles: readonly Role[]
  readonly privileges: readonly Privilege[]
  can(privilege: Privilege): boolean
}

export function createAccess(repositories: Repositories, config: AuthConfig) {
  const { users } = repositories

  const viewerOf = (user: UserRow): Viewer => {
    const roles = users.rolesOf(user)
    return {
      user,
      roles,
      privileges: privilegesOf(roles),
      can: (privilege) => grants(roles, privilege),
    }
  }

  return {
    /* Reconciled per request rather than only at sign-in, because that is what
       MOOG_ADMINS already did: adding a line to `.env` and restarting made
       somebody an admin without them signing in again, and a grant that only
       landed at the next sign-in would look like the variable was ignored.
       Adding only — see `users.grant`. */
    async viewerFor(request: Request): Promise<Viewer | null> {
      const uid = await whoAmI(request, config)
      if (uid === null) return null

      const found = users.find(uid)
      if (!found) return null

      const listed = found.email !== null && config.admins.includes(found.email.toLowerCase())
      if (!listed) return viewerOf(found)

      return viewerOf(users.grant(uid, ROLE.admin) ?? found)
    },

    viewerOf,
  }
}

export type Access = ReturnType<typeof createAccess>
