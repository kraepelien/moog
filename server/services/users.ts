import {
  effectiveRoles,
  isPrivilege,
  isRole,
  presetFor,
  resolve,
  ROLE,
  ROLES,
  PRIVILEGE,
  type Privilege,

} from '../../src/access/privileges.ts'
import type { AdminUser } from '../../src/admin/users.ts'
import { isEnvAdmin, type AuthConfig } from '../identity.ts'
import type { Repositories } from '../repositories/index.ts'
import type { UserRow } from '../repositories/users.ts'
import type { Viewer } from './access.ts'
import type { Refusal } from './refusal.ts'

/* Who may change whose access.
 *
 * Three rules keep an install from ending up with nobody able to administer
 * users, and all three are write-time: the resolution order in
 * `src/access/privileges.ts` stays a rule without exceptions, and the reasons
 * somebody may not write a particular revoke live here, where they can explain
 * themselves. */

/* Taking either of these away is what strands somebody: one hides the page, the
   other takes away the ability to put it back. */
const DOORS: readonly Privilege[] = [PRIVILEGE.AccessAdmin, PRIVILEGE.AdminUsers]

/* Roles whose preset includes AdminUsers, for the floor count. Derived rather
   than written down, so adding it to another preset cannot be forgotten. */
const ADMIN_USER_ROLES = ROLES.filter((role) => presetFor(role).includes(PRIVILEGE.AdminUsers))

export function createUserService(repositories: Repositories, config: AuthConfig) {
  const { users, db } = repositories

  const listed = (user: UserRow): boolean => isEnvAdmin(user.email, config)

  const describe = (user: UserRow, stats: AdminUser['stats']): AdminUser => {
    const envAdmin = listed(user)
    const stored = users.rolesOf(user)
    const overrides = users.overridesOf(user.id)

    return {
      uid: user.uid,
      name: user.display_name,
      email: user.email,
      avatar: user.avatar_url,
      provider: user.provider,
      roles: stored,
      envAdmin,
      privileges: resolve(effectiveRoles(stored, envAdmin), overrides),
      granted: overrides.granted,
      revoked: overrides.revoked,
      unknown: overrides.unknown,
      stats,
      createdAt: user.created_at,
      lastSeenAt: user.last_seen_at,
    }
  }

  const service = {
    list(): AdminUser[] {
      return users
        .list()
        .map((row) =>
          describe(row, {
            patches: row.patches,
            arrangements: row.arrangements,
            ratings: row.ratings,
          }),
        )
    },

    get(uid: string): AdminUser | Refusal {
      const found = users.findWithStats(uid)
      if (!found) return { error: 'not found', status: 404 }
      return describe(found, {
        patches: found.patches,
        arrangements: found.arrangements,
        ratings: found.ratings,
      })
    },

    setRoles(uid: string, given: unknown): AdminUser | Refusal {
      if (!Array.isArray(given)) return { error: 'invalid body', status: 400 }

      const target = users.find(uid)
      if (!target) return { error: 'not found', status: 404 }

      const wanted = given.filter(isRole).filter((role) => role !== ROLE.member)

      /* Refused rather than silently ignored: the toggle is drawn locked, so a
         request to remove it did not come from the page. */
      if (listed(target) && !wanted.includes(ROLE.admin)) {
        return {
          error: `${target.email} is listed in MOOG_ADMINS, so the admin role cannot be taken away here. Remove the address and restart.`,
          status: 400,
        }
      }

      const refusal = guarded(() => {
        users.setRoles(uid, wanted)
      })
      return refusal ?? service.get(uid)
    },

    /* `granted: null` deletes the row, which is how a privilege goes back to
       being whatever the roles say. */
    setOverride(
      uid: string,
      privilege: string,
      granted: boolean | null,
      actor: Viewer,
    ): AdminUser | Refusal {
      if (!isPrivilege(privilege)) return { error: 'no such privilege', status: 404 }

      const target = users.find(uid)
      if (!target) return { error: 'not found', status: 404 }

      if (granted === false) {
        const refusal = mayRevoke(target, privilege, actor)
        if (refusal) return refusal
      }

      const refusal = guarded(() => {
        users.setOverride(target.id, privilege, granted, actor.user.id)
      })
      return refusal ?? service.get(uid)
    },
  }

  function mayRevoke(target: UserRow, privilege: Privilege, actor: Viewer): Refusal | null {
    if (!DOORS.includes(privilege)) return null

    /* Yourself, because the page you would need to undo it is the one you are
       standing on. Somebody else may still take it from you. */
    if (target.id === actor.user.id) {
      return {
        error: `You cannot revoke ${privilege} from yourself — you would have no way to put it back. Another administrator can.`,
        status: 400,
      }
    }

    /* The environment is the documented way back in, so a revoke must not close
       it. Written as a refusal here rather than as an exception in the
       resolution order. */
    if (listed(target)) {
      return {
        error: `${target.email} is listed in MOOG_ADMINS, which is how an install is recovered. ${privilege} cannot be revoked from them.`,
        status: 400,
      }
    }
    return null
  }

  /* The floor: never leave nobody holding AdminUsers. Counted again *inside*
     the write's transaction, because a self-check cannot stop two
     administrators revoking each other at the same moment — both requests pass
     their own check while both still hold it. SQLite has one writer, so taking
     the count in here is what actually closes that race. */
  function guarded(write: () => void): Refusal | null {
    let refusal: Refusal | null = null

    try {
      db.transaction(() => {
        write()
        if (users.holdersOf(PRIVILEGE.AdminUsers, ADMIN_USER_ROLES) > 0) return

        refusal = {
          error:
            'That would leave nobody able to administer users. Give somebody else the privilege first.',
          status: 409,
        }
        /* Thrown to roll the write back; the refusal above is what is
           reported. */
        throw new Floor()
      })()
    } catch (error) {
      if (!(error instanceof Floor)) throw error
    }

    return refusal
  }

  return service
}

class Floor extends Error {}

export type UserService = ReturnType<typeof createUserService>
