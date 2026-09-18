import {
  effectiveRoles,
  isPrivilege,
  isAssignable,
  isRole,
  resolve,
  ROLE,
  PRIVILEGE,
  type Privilege,

} from '@access/privileges.ts'
import type { AdminUser } from '@admin/users.ts'
import { isEnvAdmin, type AuthConfig } from '@server/identity.ts'
import type { Repositories } from '@server/repositories/index.ts'
import type { UserRow } from '@server/repositories/users.ts'
import type { Viewer } from './access.ts'
import type { Refusal } from './refusal.ts'

/* Who may change whose access.
 *
 * Three rules keep an install from ending up with nobody able to administer
 * users, and all three are write-time: the resolution order in
 * `src/access/privileges.ts` stays a rule without exceptions, and the reasons
 * somebody may not write a particular revoke live here, where they can explain
 * themselves. */

/* Taking either of these away is what strands somebody. AccessAdmin because
   every administration privilege is conditional on it, so losing it loses the
   lot; AdminUsers because it is the one that can put them back. */
const DOORS: readonly Privilege[] = [PRIVILEGE.AccessAdmin, PRIVILEGE.AdminUsers]


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

      const wanted = given.filter(isRole)

      /* Refused rather than quietly dropped: asking for one of these is asking
         for something this page cannot do, and silence would look like it had
         worked. */
      const refused = wanted.filter((role) => !isAssignable(role))
      if (refused.length > 0) {
        return {
          error:
            refused.includes(ROLE.admin)
              ? 'Being an administrator comes from MOOG_ADMINS, not from here. Add the address and restart, or grant the individual privileges.'
              : 'Everybody signed in is a member; it is not a role to give.',
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

  /* Resolved per account rather than counted in SQL. Who holds a privilege
     depends on the roles and on one privilege being conditional on another,
     and a second copy of those rules in SQL is a copy that drifts — this asks
     the same `resolve` every request asks. The table is small and this runs
     only on a write. */
  function holdersOf(privilege: Privilege): number {
    const overrides = users.overridesAll()
    return users
      .list()
      .filter((row) =>
        resolve(
          effectiveRoles(users.rolesOf(row), listed(row)),
          overrides.get(row.id) ?? {},
        ).includes(privilege),
      ).length
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
        if (holdersOf(PRIVILEGE.AdminUsers) > 0) return

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
