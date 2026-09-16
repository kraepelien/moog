import type { Database } from 'bun:sqlite'

/* A row per account. With sign-in off there is one, `local`, so that a patch
   has an owner to point at before there is anyone to be. */

export interface UserRow {
  readonly id: number
  readonly uid: string
  readonly email: string | null
  readonly display_name: string | null
  readonly avatar_url: string | null
}

export function findUser(db: Database, uid: string): UserRow | null {
  return db.query<UserRow, [string]>(`select * from users where uid = ?`).get(uid) ?? null
}

export function ensureUser(
  db: Database,
  user: {
    uid: string
    provider: string
    subject: string
    email?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  },
): UserRow {
  const now = new Date().toISOString()
  db.run(
    `insert into users (uid, provider, subject, email, display_name, avatar_url,
                        created_at, last_seen_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)
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
      now,
      now,
    ],
  )
  return findUser(db, user.uid)!
}

/* The one everything belongs to until there is anyone to sign in. */
export function ensureLocalUser(db: Database, uid: string): UserRow {
  return (
    findUser(db, uid) ??
    ensureUser(db, { uid, provider: 'local', subject: uid, displayName: 'This install' })
  )
}
