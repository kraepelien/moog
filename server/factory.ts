import type { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INSTRUMENTS } from '@instruments/instruments.ts'
import { parsePatch } from '@patch/schema.ts'
import { createPatches } from './repositories/patches.ts'

/* The bank in the repo is where factory content comes from, and it is **seeded**
   rather than re-asserted: a slug the database already holds is left exactly as
   it is.

   That is what makes a factory patch editable. The rows are the live bank now,
   so an administrator correcting one has somewhere to put the correction that a
   restart will not undo — the alternative was a bank that came back from the
   image every boot and an edit that appeared to work until the next deploy.

   The files stay the starting point, and `reseed` is how to go back to them:
   it writes every file over the row, losing edits, which is the whole point of
   asking for it. Nothing does that on its own.

   Nothing except a **one-off**, which is the exception and is numbered. Seeding
   has a cost the overwriting it replaced did not have: a database that already
   holds a slug never hears about a change to its file, so a correction shipped
   in the image cannot reach a bank that is already running. Once, when the whole
   bank was re-transcribed from the manual and every row in every deployment was
   wrong, that had to be pushed through — and asking somebody to remember an
   environment variable at the right deploy is a worse plan than doing it.

   So `BANK_REFRESH` is a number the database remembers having done. Raise it and
   the next start writes every file over its row, once, and records that it has.
   It is not a migration and not a habit: raise it only when the shipped bank has
   changed in a way that has to reach rows somebody may have edited, and say in
   the pull request that it will discard their edits to those patches. Every
   start after it seeds again, so an administrator's edit outlives every deploy
   that does not raise this number. */

/* Raised to 1 when the bank was transcribed from the manual's patch sheets. */
const BANK_REFRESH = 1

/* The `meta` table is already where `db_version` lives, so remembering this
   needs no column and therefore no recreated database — which matters, because
   a recreated database is exactly the manual step this exists to avoid. */
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
  /* Whether this start was the one that pushed a raised BANK_REFRESH through,
     so the line it prints can say so rather than reporting a suspicious number
     of writes on a database that was already full. */
  readonly refreshed: boolean
}

export interface FactoryOptions {
  /* Write every file over the row it matches, discarding whatever an
     administrator has changed. */
  readonly reseed?: boolean
}

export function syncInstruments(db: Database): void {
  const upsert = db.prepare(
    `insert into instruments (slug, name) values (?, ?)
     on conflict(slug) do update set name = excluded.name`,
  )
  for (const instrument of INSTRUMENTS) upsert.run(instrument.id, instrument.name)
}

export function loadFactory(
  db: Database,
  bank: string,
  options: FactoryOptions = {},
): FactoryLoad {
  syncInstruments(db)
  const patches = createPatches(db)

  let files: string[]
  try {
    files = readdirSync(bank).filter((file) => file.endsWith('.json')).sort()
  } catch {
    return { loaded: 0, kept: 0, retired: 0, refreshed: false }
  }

  const refreshed = refreshDone(db) < BANK_REFRESH
  const overwrite = options.reseed === true || refreshed

  const slugs: string[] = []
  let loaded = 0
  let kept = 0
  db.transaction(() => {
    for (const file of files) {
      const slug = file.slice(0, -'.json'.length)
      slugs.push(slug)

      /* Seeded, not synced. A row that is already here is the live bank, edits
         and all, and the file is only where it started. */
      if (!overwrite && patches.hasFactory(slug)) {
        kept++
        continue
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
    if (refreshed) recordRefresh(db)
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

  return { loaded, kept, retired: retired.changes, refreshed }
}
