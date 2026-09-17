import type { Database } from 'bun:sqlite'
import { DB_VERSION } from '@server/db.ts'

/* An old database, for testing a migration against.

   SCHEMA is keyed by the version it upgrades from and has no way back, so an
   old database is made by opening a current one and undoing the steps. Every
   step above the wanted version has to be undone, not just the one under test:
   reopening runs all of them, and a step whose table is already there fails.

   Keyed the same way the steps are, by the version each one produces. **A step
   added to SCHEMA needs its undo added here**, or every test that winds back
   past it breaks with `already exists`. */
const UNDO: Record<number, (db: Database) => void> = {
  2: (db) => {
    db.run(`
      create table ratings_whole (
        user_id integer not null references users(id) on delete cascade,
        patch_id integer not null references patches(id) on delete cascade,
        stars integer not null check (stars between 1 and 5),
        updated_at text not null,
        primary key (user_id, patch_id)
      );
      insert into ratings_whole (user_id, patch_id, stars, updated_at)
        select user_id, patch_id, cast(stars as integer), updated_at from ratings;
      drop table ratings;
      alter table ratings_whole rename to ratings;
    `)
  },
  3: (db) => db.run(`alter table users drop column roles`),
  4: (db) => db.run(`drop table arrangements`),
}

export function windBackTo(db: Database, version: number): void {
  for (let step = DB_VERSION; step > version; step--) UNDO[step]?.(db)
  db.run(`update meta set value = ? where key = 'db_version'`, [String(version)])
}
