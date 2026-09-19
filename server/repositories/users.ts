import type { Database } from 'bun:sqlite'
import {
  formatRoles,
  isPrivilege,
  parseRoles,
  type Privilege,
  type Role,
} from '@access/privileges.ts'
import type { Decided, UserStats } from '@admin/users.ts'

/* A row per account, the roles it holds, and the per-privilege answers that
   beat them. Rows in, rows out: whether a write is allowed is the users
   service's question. */

export interface UserRow {
  readonly id: number
  readonly uid: string
  readonly provider: string
  readonly email: string | null
  readonly display_name: string | null
  readonly avatar_url: string | null
  readonly roles: string
  readonly created_at: string
  readonly last_seen_at: string
}

export interface NewUser {
  readonly uid: string
  readonly provider: string
  readonly subject: string
  readonly email?: string | null
  readonly displayName?: string | null
  readonly avatarUrl?: string | null
  readonly roles?: readonly Role[]
}

/* `granted` false is a revoke, which is a row rather than an absence — the
   absence is what "inherited" means. */
export interface Overridden {
  readonly granted: Privilege[]
  readonly revoked: Privilege[]
  /* Names this build does not know, kept so the page can show them and so
     nothing here quietly deletes a row it did not understand. */
  readonly unknown: string[]
}

/* Which bucket a stored row falls in. Exported and shared rather than written
   out beside each query, because three callers now read the same table and a
   second copy of this is one that drifts. */
export function sortOverrides(
  rows: Iterable<{ readonly privilege: string; readonly granted: boolean }>,
): Overridden {
  const granted: Privilege[] = []
  const revoked: Privilege[] = []
  const unknown: string[] = []

  for (const row of rows) {
    if (!isPrivilege(row.privilege)) unknown.push(row.privilege)
    else (row.granted ? granted : revoked).push(row.privilege)
  }
  return { granted, revoked, unknown }
}

interface DecidedRow {
  user_id: number
  privilege: string
  granted: number
  at: string
  by_uid: string | null
  by_name: string | null
  by_email: string | null
}

/* The audit columns every write already fills, joined to the account that
   wrote them. A left join, because `by_user_id` is `on delete set null` and
   the install writes rows with no actor at all. */
const DECIDED = `
  select o.user_id, o.privilege, o.granted, o.at,
         d.uid as by_uid, d.display_name as by_name, d.email as by_email
    from user_privileges o
    left join users d on d.id = o.by_user_id`

const decided = (row: DecidedRow): Decided => ({
  privilege: row.privilege,
  granted: row.granted === 1,
  at: row.at,
  by: row.by_uid === null ? null : { uid: row.by_uid, name: row.by_name, email: row.by_email },
})

const STATS = `
  (select count(*) from patches p
    where p.owner_id = u.id and p.deleted_at is null) as patches,
  (select count(*) from arrangements a where a.owner_id = u.id) as arrangements,
  (select count(*) from ratings r where r.user_id = u.id) as ratings`

interface ListRow extends UserRow {
  patches: number
  arrangements: number
  ratings: number
}

export function createUsers(db: Database) {
  const byUid = db.query<UserRow, [string]>(`select * from users where uid = ?`)

  const repository = {
    find(uid: string): UserRow | null {
      return byUid.get(uid) ?? null
    },

    findById(id: number): UserRow | null {
      return db.query<UserRow, [number]>(`select * from users where id = ?`).get(id) ?? null
    },

    /* Everybody, with the counts the admin page shows. One query with
       correlated subqueries, like the library's. */
    list(): (UserRow & UserStats)[] {
      return db
        .query<ListRow, []>(
          `select u.*, ${STATS} from users u order by u.display_name collate nocase, u.uid`,
        )
        .all()
    },

    findWithStats(uid: string): (UserRow & UserStats) | null {
      return (
        db
          .query<ListRow, [string]>(`select u.*, ${STATS} from users u where u.uid = ?`)
          .get(uid) ?? null
      )
    },

    /* Profile fields are refreshed from the provider on every sign-in; roles
       never are. A role granted in the app has to survive the next sign-in, and
       an `excluded.roles` here would quietly hand it back. */
    ensure(user: NewUser): UserRow {
      const now = new Date().toISOString()
      db.run(
        `insert into users (uid, provider, subject, email, display_name, avatar_url,
                            roles, created_at, last_seen_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(provider, subject) do update set
           email = excluded.email,
           display_name = excluded.display_name,
           avatar_url = excluded.avatar_url,
           last_seen_at = excluded.last_seen_at`,
        [
          user.uid,
          user.provider,
          user.subject,
          user.email ?? null,
          user.displayName ?? null,
          user.avatarUrl ?? null,
          formatRoles(user.roles ?? []),
          now,
          now,
        ],
      )
      return repository.find(user.uid)!
    },

    rolesOf(user: UserRow): Role[] {
      return parseRoles(user.roles)
    },

    setRoles(uid: string, roles: readonly Role[]): UserRow | null {
      if (!repository.find(uid)) return null
      db.run(`update users set roles = ? where uid = ?`, [formatRoles(roles), uid])
      return repository.find(uid)
    },

    grant(uid: string, role: Role): UserRow | null {
      const user = repository.find(uid)
      if (!user) return null
      return repository.setRoles(uid, [...parseRoles(user.roles), role])
    },

    revoke(uid: string, role: Role): UserRow | null {
      const user = repository.find(uid)
      if (!user) return null
      return repository.setRoles(
        uid,
        parseRoles(user.roles).filter((held) => held !== role),
      )
    },

    /* Run on every authenticated request, through the viewer lookup, which is
       why the actor's name is a second method rather than a join here: one
       admin page reads it and every page load would pay for it. */
    overridesOf(userId: number): Overridden {
      const rows = db
        .query<{ privilege: string; granted: number }, [number]>(
          `select privilege, granted from user_privileges where user_id = ?`,
        )
        .all(userId)

      return sortOverrides(
        rows.map((row) => ({ privilege: row.privilege, granted: row.granted === 1 })),
      )
    },

    decisionsOf(userId: number): Decided[] {
      return db
        .query<DecidedRow, [number]>(`${DECIDED} where o.user_id = ? order by o.privilege`)
        .all(userId)
        .map(decided)
    },

    decisionsAll(): Map<number, Decided[]> {
      const byUser = new Map<number, Decided[]>()
      for (const row of db.query<DecidedRow, []>(`${DECIDED} order by o.privilege`).all()) {
        const held = byUser.get(row.user_id) ?? []
        held.push(decided(row))
        byUser.set(row.user_id, held)
      }
      return byUser
    },

    /* `null` removes the row, which is what returning a privilege to inherited
       means. One privilege at a time, so a name this build does not know is
       left exactly as it was. */
    setOverride(
      userId: number,
      privilege: string,
      granted: boolean | null,
      by: number | null,
    ): void {
      if (granted === null) {
        db.run(`delete from user_privileges where user_id = ? and privilege = ?`, [
          userId,
          privilege,
        ])
        return
      }
      db.run(
        `insert into user_privileges (user_id, privilege, granted, at, by_user_id)
         values (?, ?, ?, ?, ?)
         on conflict(user_id, privilege) do update set
           granted = excluded.granted, at = excluded.at, by_user_id = excluded.by_user_id`,
        [userId, privilege, granted ? 1 : 0, new Date().toISOString(), by],
      )
    },

    /* Everybody's overrides in one query, for the rare question that has to be
       asked about every account at once. Returning them rather than answering
       "who holds X" in SQL: the answer depends on the roles and on one
       privilege being conditional on another, and a second copy of those rules
       written in SQL is a copy that drifts. */
    overridesAll(): Map<number, Overridden> {
      const rows = db
        .query<{ user_id: number; privilege: string; granted: number }, []>(
          `select user_id, privilege, granted from user_privileges`,
        )
        .all()

      const byUser = new Map<number, { privilege: string; granted: boolean }[]>()
      for (const row of rows) {
        const held = byUser.get(row.user_id) ?? []
        held.push({ privilege: row.privilege, granted: row.granted === 1 })
        byUser.set(row.user_id, held)
      }
      return new Map([...byUser].map(([userId, held]) => [userId, sortOverrides(held)]))
    },

    /* The one everything belongs to until there is anyone to sign in. No roles:
       being an administrator in `off` mode is worked out from the mode, like
       every other way of being one. */
    ensureLocal(uid: string): UserRow {
      return (
        repository.find(uid) ??
        repository.ensure({
          uid,
          provider: 'local',
          subject: uid,
          displayName: 'This install',
        })
      )
    },
  }

  return repository
}

export type Users = ReturnType<typeof createUsers>
