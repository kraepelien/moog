import type { Database } from 'bun:sqlite'
import { formatRoles, parseRoles, ROLE, type Role } from '@access/privileges.ts'

/* A row per account. With sign-in off there is one, `local`, so that a patch
   has an owner to point at before there is anyone to be. */

export interface UserRow {
  readonly id: number
  readonly uid: string
  readonly email: string | null
  readonly display_name: string | null
  readonly avatar_url: string | null
  readonly roles: string
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

export function createUsers(db: Database) {
  const byUid = db.query<UserRow, [string]>(`select * from users where uid = ?`)

  const repository = {
    find(uid: string): UserRow | null {
      return byUid.get(uid) ?? null
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
          formatRoles(user.roles ?? [ROLE.member]),
          now,
          now,
        ],
      )
      return repository.find(user.uid)!
    },

    rolesOf(user: UserRow): Role[] {
      return parseRoles(user.roles)
    },

    /* Adding only. What the environment says is a grant rather than the whole
       truth: a list that also revoked would fight every grant made in the app,
       and one typo in `.env` would demote everybody at the next restart. */
    grant(uid: string, role: Role): UserRow | null {
      const user = repository.find(uid)
      if (!user) return null

      const held = parseRoles(user.roles)
      if (held.includes(role)) return user

      db.run(`update users set roles = ? where uid = ?`, [formatRoles([...held, role]), uid])
      return repository.find(uid)
    },

    revoke(uid: string, role: Role): UserRow | null {
      const user = repository.find(uid)
      if (!user) return null

      const kept = parseRoles(user.roles).filter((held) => held !== role)
      db.run(`update users set roles = ? where uid = ?`, [formatRoles(kept), uid])
      return repository.find(uid)
    },

    /* The one everything belongs to until there is anyone to sign in. It holds
       admin outright, which is what keeps `off` mode from being a special case
       in the privilege check. */
    ensureLocal(uid: string): UserRow {
      return (
        repository.find(uid) ??
        repository.ensure({
          uid,
          provider: 'local',
          subject: uid,
          displayName: 'This install',
          roles: [ROLE.admin, ROLE.member],
        })
      )
    },
  }

  return repository
}

export type Users = ReturnType<typeof createUsers>
