import type { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INSTRUMENTS } from '@instruments/instruments.ts'
import { parsePatch } from '@patch/schema.ts'
import { createPatches } from './repositories/patches.ts'

/* The bank in the repo is where factory content comes from, and it is **seeded**
   rather than re-asserted: a slug the database already holds is left exactly as
   it is.

   That is what makes a factory preset editable. The rows are the live bank now,
   so an administrator correcting one has somewhere to put the correction that a
   restart will not undo — the alternative was a bank that came back from the
   image every boot and an edit that appeared to work until the next deploy.

   The files stay the starting point, and `reseed` is how to go back to them:
   it writes every file over the row, losing edits, which is the whole point of
   asking for it. Nothing does that on its own. */

export interface FactoryLoad {
  /* Written this time: everything on a first start, and only what is new on
     every start after it. */
  readonly loaded: number
  /* Already there and left alone. */
  readonly kept: number
  readonly retired: number
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
    return { loaded: 0, kept: 0, retired: 0 }
  }

  const slugs: string[] = []
  let loaded = 0
  let kept = 0
  db.transaction(() => {
    for (const file of files) {
      const slug = file.slice(0, -'.json'.length)
      slugs.push(slug)

      /* Seeded, not synced. A row that is already here is the live bank, edits
         and all, and the file is only where it started. */
      if (!options.reseed && patches.hasPreset(slug)) {
        kept++
        continue
      }

      const parsed = parsePatch(JSON.parse(readFileSync(join(bank, file), 'utf8')))
      /* Loudly, at startup: a bank file that will not parse is a mistake in the
         repo, not something a user can fix by reloading. */
      if (!parsed.ok) throw new Error(`${file}: ${parsed.error}`)
      patches.putPreset(slug, parsed.value)
      loaded++
    }
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

  return { loaded, kept, retired: retired.changes }
}
