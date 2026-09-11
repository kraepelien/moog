import { describe, expect, test } from 'bun:test'
import { migrateToCurrent, migrations } from '../src/patch/migrate.ts'
import { PATCH_SCHEMA_VERSION, createPatch, parsePatch } from '../src/patch/schema.ts'
import { fixedIdentity } from './fixtures.ts'

describe('createPatch', () => {
  test('stamps the current schema version and matching timestamps', () => {
    const patch = createPatch({ name: 'Bass' }, fixedIdentity())
    expect(patch.schemaVersion).toBe(PATCH_SCHEMA_VERSION)
    expect(patch.id).toBe('id-1')
    expect(patch.createdAt).toBe(patch.updatedAt)
    expect(patch.values).toEqual({})
  })

  test('copies values rather than aliasing the object it was given', () => {
    const values = { a: 1 }
    const patch = createPatch({ values }, fixedIdentity())
    values.a = 2
    expect(patch.values).toEqual({ a: 1 })
  })
})

describe('parsePatch', () => {
  test('accepts a well-formed patch', () => {
    const patch = createPatch({ name: 'Lead' }, fixedIdentity())
    const parsed = parsePatch(JSON.parse(JSON.stringify(patch)))
    expect(parsed.ok).toBe(true)
  })

  test.each([
    ['not an object', 'null'],
    ['missing schemaVersion', JSON.stringify({ id: 'a', name: '', notes: '', values: {}, createdAt: '', updatedAt: '' })],
    ['missing id', JSON.stringify({ schemaVersion: 1, name: '', notes: '', values: {}, createdAt: '', updatedAt: '' })],
    ['values not an object', JSON.stringify({ schemaVersion: 1, id: 'a', name: '', notes: '', values: [], createdAt: '', updatedAt: '' })],
  ])('rejects: %s', (_label, json) => {
    const parsed = parsePatch(JSON.parse(json))
    expect(parsed.ok).toBe(false)
  })
})

describe('migrateToCurrent', () => {
  test('passes a current-version patch through', () => {
    const patch = createPatch({ name: 'Pad' }, fixedIdentity())
    const result = migrateToCurrent(JSON.parse(JSON.stringify(patch)))
    expect(result.ok && result.value.name).toBe('Pad')
  })

  test('refuses a patch from a newer build instead of guessing', () => {
    const patch = { ...createPatch({}, fixedIdentity()), schemaVersion: PATCH_SCHEMA_VERSION + 1 }
    const result = migrateToCurrent(JSON.parse(JSON.stringify(patch)))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/Update the app/)
  })

  test('the migration chain is empty while there is only one version', () => {
    expect(Object.keys(migrations)).toEqual([])
  })
})
