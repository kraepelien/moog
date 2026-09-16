import { err, ok, type Result } from '../result.ts'
import { PATCH_SCHEMA_VERSION, parsePatch, type Patch } from './schema.ts'

/* Keyed by the version it upgrades FROM, producing that version plus one. A v1
   patch reaching a v3 build runs migrations[1] then migrations[2]. Empty while
   there is only one version; the shape exists from the first commit so v2 is a
   single entry rather than a guess at what unversioned data meant. */
export type Migration = (patch: Record<string, unknown>) => Record<string, unknown>

export const migrations: Readonly<Record<number, Migration>> = {}

export function migrateToCurrent(raw: unknown): Result<Patch> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return err('Patch is not an object')
  }

  const source = raw as Record<string, unknown>
  const version = source.schemaVersion

  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return err('Patch is missing an integer schemaVersion')
  }
  if (version < 1) return err(`Unsupported patch schema version ${version}`)

  /* Never guess forward. A file written by a newer build may use control values
     or fields this build would silently mangle. */
  if (version > PATCH_SCHEMA_VERSION) {
    return err(
      `Patch uses schema version ${version}, but this build understands up to ${PATCH_SCHEMA_VERSION}. Update the app to open it.`,
    )
  }

  const migrated = runMigrations(source, version, migrations, PATCH_SCHEMA_VERSION)
  if (!migrated.ok) return migrated

  const parsed = parsePatch(migrated.value)
  if (!parsed.ok) return parsed
  return ok(parsed.value)
}

/* The chain itself, taking its table rather than reading the one above, so the
   machinery can be exercised before there is a real migration to exercise it
   with. The first genuine one should not be the first run of this loop.

   Each step is stamped with the version it produced rather than trusting the
   migration to do it: a migration that forgets would otherwise loop, and one
   that stamps the wrong number would be believed. */
export function runMigrations(
  source: Record<string, unknown>,
  from: number,
  table: Readonly<Record<number, Migration>>,
  target: number,
): Result<Record<string, unknown>> {
  let current = source
  for (let version = from; version < target; version++) {
    const migration = table[version]
    if (!migration) {
      return err(`No migration from patch schema version ${version} to ${version + 1}`)
    }
    try {
      current = { ...migration(current), schemaVersion: version + 1 }
    } catch (error) {
      /* A migration is ordinary code and can throw on data it did not expect.
         Reported as a refusal so one bad patch in an import is skipped and
         named, rather than taking the whole file down with it. */
      const reason = error instanceof Error ? error.message : String(error)
      return err(`Migration from patch schema version ${version} failed: ${reason}`)
    }
  }
  return ok(current)
}
