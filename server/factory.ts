import type { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INSTRUMENTS } from '@instruments/instruments.ts'
import { parsePatch } from '@patch/schema.ts'
import { createPatches } from './repositories/patches.ts'

/* The bank in the repo seeds a database that does not hold a patch yet, and
   never writes over one that does. From a database's first start its rows are
   the live bank, so the only thing that changes a factory patch is an
   administrator editing it, and that edit outlives every deploy.

   There is deliberately no lever for pushing a file back over a row. A file
   that disagrees with the database is the file being out of date, and anything
   offering to put the repo's copy back is a way to discard somebody's
   corrections by accident. The files are what a fresh database is built from,
   and the record of what was transcribed, and nothing beyond that.

   `BANK_REFRESH` is the one exception and it is spent. A database that already
   holds a slug never hears about a change to its file, so re-transcribing the
   whole bank from the manual had to reach rows that already existed, once. It
   is a number the database remembers having done, raised to 1 for that and not
   raised again: every value after this one discards edits somebody made on
   purpose. `test/factoryBank.test.ts` pins it. */
const BANK_REFRESH = 1

/* The `meta` table is already where `db_version` lives, so remembering this
   needs no column and therefore no recreated database, which matters because a
   recreated database is exactly the manual step this exists to avoid. */
function refreshDone(db: Database): number {
  db.run(`create table if not exists meta (key text primary key, value text not null)`)
  const row = db
    .query<{ value: string }, []>(`select value from meta where key = 'bank_refresh'`)
    .get()
  return row ? Number(row.value) : 0
}

function recordRefresh(db: Database): void {
  db.run(
    `insert into meta (key, value) values ('bank_refresh', ?)
     on conflict(key) do update set value = excluded.value`,
    [String(BANK_REFRESH)],
  )
}

export interface FactoryLoad {
  /* Written this time: everything on a first start, and only what is new on
     every start after it. */
  readonly loaded: number
  /* Already there and left alone. */
  readonly kept: number
  readonly retired: number
  /* Whether this start pushed BANK_REFRESH through over rows that were already
     there. A first start writes the whole bank too, and calling that a refresh
     would announce an exceptional event on an ordinary empty database. */
  readonly refreshed: boolean
}

export function syncInstruments(db: Database): void {
  const upsert = db.prepare(
    `insert into instruments (slug, name) values (?, ?)
     on conflict(slug) do update set name = excluded.name`,
  )
  for (const instrument of INSTRUMENTS) upsert.run(instrument.id, instrument.name)
}

export function loadFactory(db: Database, bank: string): FactoryLoad {
  syncInstruments(db)
  const patches = createPatches(db)

  let files: string[]
  try {
    files = readdirSync(bank).filter((file) => file.endsWith('.json')).sort()
  } catch {
    return { loaded: 0, kept: 0, retired: 0, refreshed: false }
  }

  const refreshing = refreshDone(db) < BANK_REFRESH

  const slugs: string[] = []
  let loaded = 0
  let kept = 0
  let overwritten = 0
  db.transaction(() => {
    for (const file of files) {
      const slug = file.slice(0, -'.json'.length)
      slugs.push(slug)

      if (patches.hasFactory(slug)) {
        /* Seeded, not synced. A row that is already here is the live bank,
           edits and all, and the file is only where it started. */
        if (!refreshing) {
          kept++
          continue
        }
        overwritten++
      }

      const parsed = parsePatch(JSON.parse(readFileSync(join(bank, file), 'utf8')))
      /* Loudly, at startup: a bank file that will not parse is a mistake in the
         repo, not something a user can fix by reloading. */
      if (!parsed.ok) throw new Error(`${file}: ${parsed.error}`)
      patches.putFactory(slug, parsed.value)
      loaded++
    }
    /* Inside the transaction: a start that wrote half the bank and then failed
       must not be remembered as having done it. */
    if (refreshing) recordRefresh(db)
  })()

  /* Anything the image no longer ships. Soft-deleted rather than dropped so a
     rating or a copy that points at it still has something to point at. */
  const placeholders = slugs.map(() => '?').join(', ')
  const retired = db.run(
    `update patches set deleted_at = ?
      where slug is not null and deleted_at is null
        and slug not in (${placeholders || "''"})`,
    [new Date().toISOString(), ...slugs],
  )

  return { loaded, kept, retired: retired.changes, refreshed: overwritten > 0 }
}
