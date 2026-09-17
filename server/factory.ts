import type { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INSTRUMENTS } from '@instruments/instruments.ts'
import { parsePatch } from '@patch/schema.ts'
import { createPatches } from './repositories/patches.ts'

/* The bank in the repo is the truth about factory content, and it is reloaded
   on every start. That replaces the seed manifest, which existed only because
   the files were being copied once: a row refreshed from the image cannot drift
   from it, and nobody can delete one for everybody. */

export interface FactoryLoad {
  readonly loaded: number
  readonly retired: number
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
    return { loaded: 0, retired: 0 }
  }

  const slugs: string[] = []
  db.transaction(() => {
    for (const file of files) {
      const slug = file.slice(0, -'.json'.length)
      const parsed = parsePatch(JSON.parse(readFileSync(join(bank, file), 'utf8')))
      /* Loudly, at startup: a bank file that will not parse is a mistake in the
         repo, not something a user can fix by reloading. */
      if (!parsed.ok) throw new Error(`${file}: ${parsed.error}`)
      patches.putPreset(slug, parsed.value)
      slugs.push(slug)
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

  return { loaded: slugs.length, retired: retired.changes }
}
