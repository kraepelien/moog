import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/db.ts'

/* Half stars arrived after people had already rated things, and a check
   constraint cannot be loosened in place: the step rebuilds the table, which is
   the one kind of migration that can lose rows. So an old database is put back
   together here and reopened, rather than trusting that the copy is right.

   The old table is written out by hand because SCHEMA is keyed by the version it
   upgrades from and has no way back. Reopening runs every step from the version
   set here, so the fixture has to undo each one it will make run again — the
   rebuilt ratings table, and the roles column added after it. A step added later
   belongs here too, or it re-runs against a schema that already has it. */

const roots: string[] = []

function databaseAsItWasBeforeHalfStars(): string {
  const root = mkdtempSync(join(tmpdir(), 'moog-rating-'))
  roots.push(root)
  const path = join(root, 'moog.db')

  const db = openDatabase(path)
  db.run(`alter table users drop column roles`)
  db.run(`drop table ratings`)
  db.run(`
    create table ratings (
      user_id integer not null references users(id) on delete cascade,
      patch_id integer not null references patches(id) on delete cascade,
      stars integer not null check (stars between 1 and 5),
      updated_at text not null,
      primary key (user_id, patch_id)
    )`)
  db.run(`insert into users (id, uid, provider, subject, created_at, last_seen_at)
          values (1, 'u1', 'test', '1', '2026-01-01', '2026-01-01'),
                 (2, 'u2', 'test', '2', '2026-01-01', '2026-01-01')`)
  db.run(`insert into instruments (id, slug, name) values (1, 'minimoog-model-d', 'Model D')`)
  db.run(`insert into patches (id, uid, instrument_id, name, visibility, schema_version,
                               values_json, created_at, updated_at)
          values (1, 'p1', 1, 'Rated', 'public', 1, '{}', '2026-01-01', '2026-01-01')`)
  db.run(`insert into ratings (user_id, patch_id, stars, updated_at)
          values (1, 1, 4, '2026-01-01'), (2, 1, 5, '2026-01-02')`)
  db.run(`update meta set value = '1' where key = 'db_version'`)
  db.close()

  return path
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('making room for half stars', () => {
  test('keeps every whole rating already given, and who gave it', () => {
    const db = openDatabase(databaseAsItWasBeforeHalfStars())
    expect(
      db
        .query<{ user_id: number; stars: number; updated_at: string }, []>(
          `select user_id, stars, updated_at from ratings order by user_id`,
        )
        .all(),
    ).toEqual([
      { user_id: 1, stars: 4, updated_at: '2026-01-01' },
      { user_id: 2, stars: 5, updated_at: '2026-01-02' },
    ])
  })

  test('accepts a half afterwards and still refuses a quarter', () => {
    const db = openDatabase(databaseAsItWasBeforeHalfStars())
    db.run(`insert into ratings (user_id, patch_id, stars, updated_at)
            values (1, 1, 2.5, '2026-01-03')
            on conflict(user_id, patch_id) do update set stars = excluded.stars`)
    expect(
      db.query<{ stars: number }, []>(`select stars from ratings where user_id = 1`).get()?.stars,
    ).toBe(2.5)

    expect(() =>
      db.run(`insert into ratings (user_id, patch_id, stars, updated_at)
              values (2, 1, 2.25, '2026-01-03')
              on conflict(user_id, patch_id) do update set stars = excluded.stars`),
    ).toThrow()
  })

  /* The rebuild renames a table into place, and a foreign key pointed at the
     old name would survive as a reference to something gone. */
  test('leaves the rows still hanging off their user and patch', () => {
    const db = openDatabase(databaseAsItWasBeforeHalfStars())
    db.run(`delete from users where id = 1`)
    expect(db.query<{ n: number }, []>(`select count(*) as n from ratings`).get()?.n).toBe(1)
  })
})
