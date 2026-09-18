import { describe, expect, test } from 'bun:test'
import { openDatabase } from '@server/db.ts'

/* What the schema refuses and what it takes with it. Both were found by the
   migrations that built up to it — the check constraint lists half steps rather
   than testing a remainder, and the ratings table was rebuilt once, which is
   where a foreign key pointing at a renamed table would have been lost. The
   steps are gone; the two facts they were proving are still the schema's. */

function fresh() {
  const db = openDatabase(':memory:')
  db.run(`insert into users (id, uid, provider, subject, created_at, last_seen_at)
          values (1, 'u1', 'test', '1', '2026-01-01', '2026-01-01'),
                 (2, 'u2', 'test', '2', '2026-01-01', '2026-01-01')`)
  db.run(`insert into instruments (id, slug, name) values (1, 'minimoog-model-d', 'Model D')`)
  db.run(`insert into patches (id, uid, instrument_id, name, visibility, schema_version,
                               values_json, created_at, updated_at)
          values (1, 'p1', 1, 'Rated', 'public', 1, '{}', '2026-01-01', '2026-01-01')`)
  return db
}

describe('a rating', () => {
  test('may be a half star, and may not be a quarter', () => {
    const db = fresh()
    db.run(`insert into ratings (user_id, patch_id, stars, updated_at)
            values (1, 1, 2.5, '2026-01-03')`)
    expect(
      db.query<{ stars: number }, []>(`select stars from ratings where user_id = 1`).get()?.stars,
    ).toBe(2.5)

    expect(() =>
      db.run(`insert into ratings (user_id, patch_id, stars, updated_at)
              values (2, 1, 2.25, '2026-01-03')`),
    ).toThrow()
    db.close()
  })

  test('goes with the account that gave it', () => {
    const db = fresh()
    db.run(`insert into ratings (user_id, patch_id, stars, updated_at)
            values (1, 1, 4, '2026-01-01'), (2, 1, 5, '2026-01-02')`)
    db.run(`delete from users where id = 1`)
    expect(db.query<{ n: number }, []>(`select count(*) as n from ratings`).get()?.n).toBe(1)
    db.close()
  })
})
