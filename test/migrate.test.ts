import { describe, expect, test } from 'bun:test'
import { migrations, runMigrations, type Migration } from '@patch/migrate.ts'
import { PATCH_SCHEMA_VERSION } from '@patch/schema.ts'

/* There is one schema version, so the real table is empty and the chain has
   never run. These drive it with a table of their own, because the first
   migration this project writes will be run against patches somebody cares
   about, and that is a poor moment to find out the loop was wrong.

   What each step does is deliberately trivial — the point is the plumbing
   around it: order, stamping, and what happens when a link is missing or
   throws. */

const renaming = (from: string, to: string): Migration => (patch) => {
  const values = { ...(patch.values as Record<string, unknown>) }
  if (from in values) {
    values[to] = values[from]
    delete values[from]
  }
  return { ...patch, values }
}

const at = (version: number, values: Record<string, unknown> = {}) => ({
  schemaVersion: version,
  values,
})

describe('the migration chain', () => {
  test('has a link for every version below the current one', () => {
    /* The check that catches the mistake of bumping the version without
       writing the upgrade: a patch of any older version must have a way up. */
    for (let version = 1; version < PATCH_SCHEMA_VERSION; version++) {
      expect(migrations[version]).toBeDefined()
    }
    const patch = at(PATCH_SCHEMA_VERSION, { osc1Volume: 5 })
    expect(runMigrations(patch, PATCH_SCHEMA_VERSION, migrations, PATCH_SCHEMA_VERSION)).toEqual({
      ok: true,
      value: patch,
    })
  })

  test('runs one step and stamps the version it produced', () => {
    const table = { 1: renaming('oldName', 'newName') }
    const result = runMigrations(at(1, { oldName: 3 }), 1, table, 2)

    expect(result.ok).toBe(true)
    expect(result.ok && result.value).toEqual({ schemaVersion: 2, values: { newName: 3 } })
  })

  test('runs several in order, each seeing what the last one wrote', () => {
    /* The bug this guards is a chain that applies the table in key order, or
       applies one step twice: renaming a to b to c only lands on c if they run
       in sequence. */
    const table = {
      1: renaming('a', 'b'),
      2: renaming('b', 'c'),
      3: renaming('c', 'd'),
    }
    const result = runMigrations(at(1, { a: 7 }), 1, table, 4)

    expect(result.ok && result.value).toEqual({ schemaVersion: 4, values: { d: 7 } })
  })

  test('starts from the version the patch declares, not from the first one', () => {
    const table = {
      1: () => {
        throw new Error('this step should not run')
      },
      2: renaming('b', 'c'),
    }
    const result = runMigrations(at(2, { b: 1 }), 2, table, 3)

    expect(result.ok && result.value).toEqual({ schemaVersion: 3, values: { c: 1 } })
  })

  test('stamps the step it ran even when the migration sets the wrong version', () => {
    /* Otherwise a migration that copies the old version forward would send the
       loop round again, and one that stamps too high would skip a step. */
    const table = { 1: (patch: Record<string, unknown>) => ({ ...patch, schemaVersion: 99 }) }
    const result = runMigrations(at(1), 1, table, 2)

    expect(result.ok && (result.value as { schemaVersion: number }).schemaVersion).toBe(2)
  })

  test('refuses when a link is missing rather than skipping it', () => {
    /* Skipping would hand a v1 patch to a v3 parser as though it were v3. */
    const table = { 1: renaming('a', 'b') }
    const result = runMigrations(at(1, { a: 1 }), 1, table, 3)

    expect(result).toEqual({ ok: false, error: 'No migration from patch schema version 2 to 3' })
  })

  test('refuses when a migration throws, naming the step', () => {
    /* A migration is ordinary code meeting data it did not expect. Thrown out
       of here it would take down a whole import; returned, the one patch is
       skipped and reported. */
    const table = {
      1: () => {
        throw new TypeError('values is not an object')
      },
    }
    const result = runMigrations(at(1), 1, table, 2)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toBe(
      'Migration from patch schema version 1 failed: values is not an object',
    )
  })

  test('leaves the patch it was given alone', () => {
    /* The caller still holds the original — an import that rejects a patch
       later on must not have half-migrated the copy it reports. */
    const original = at(1, { a: 1 })
    const table = { 1: renaming('a', 'b') }
    runMigrations(original, 1, table, 2)

    expect(original).toEqual({ schemaVersion: 1, values: { a: 1 } })
  })
})
