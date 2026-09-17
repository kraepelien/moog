import type { Database } from 'bun:sqlite'

/* Whatever the app wants remembered per person, stored opaquely. The server
   never reads inside it, so adding a setting is a client change alone. */

export function createSettings(db: Database) {
  return {
    of(userId: number): unknown {
      const row = db
        .query<{ json: string }, [number]>(`select json from settings where user_id = ?`)
        .get(userId)
      return row ? JSON.parse(row.json) : {}
    },

    put(userId: number, settings: unknown): void {
      db.run(
        `insert into settings (user_id, json) values (?, ?)
         on conflict(user_id) do update set json = excluded.json`,
        [userId, JSON.stringify(settings)],
      )
    },
  }
}

export type Settings = ReturnType<typeof createSettings>
