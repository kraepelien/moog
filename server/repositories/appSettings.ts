import type { Database } from 'bun:sqlite'

/* The building's own settings, keyed and global — unlike `settings`, which is a
   row per person.

   Nothing writes one today: the skin that used to live here is a preview kept
   on the device instead. Both this and its table are kept because a schema step
   is append-only, and removing the accessor is how somebody comes to remove the
   step.

   Stored opaquely, like the per-person table. What a key means belongs to
   whoever reads it, and a repository that knew would be a second place for the
   shape to live. */

export function createAppSettings(db: Database) {
  return {
    of(key: string): unknown {
      const row = db
        .query<{ json: string }, [string]>(`select json from app_settings where key = ?`)
        .get(key)
      return row ? JSON.parse(row.json) : null
    },

    put(key: string, value: unknown): void {
      db.run(
        `insert into app_settings (key, json, updated_at) values (?, ?, ?)
         on conflict(key) do update set json = excluded.json, updated_at = excluded.updated_at`,
        [key, JSON.stringify(value), new Date().toISOString()],
      )
    },
  }
}

export type AppSettings = ReturnType<typeof createAppSettings>
