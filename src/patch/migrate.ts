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

  let current = source
  for (let from = version; from < PATCH_SCHEMA_VERSION; from++) {
    const migration = migrations[from]
    if (!migration) return err(`No migration from patch schema version ${from} to ${from + 1}`)
    current = migration(current)
    current = { ...current, schemaVersion: from + 1 }
  }

  const parsed = parsePatch(current)
  if (!parsed.ok) return parsed
  return ok(parsed.value)
}
