import { describe, expect, test } from 'bun:test'
import { migrateToCurrent, migrations } from '../src/patch/migrate.ts'
import { PATCH_SCHEMA_VERSION, createPatch, parsePatch } from '../src/patch/schema.ts'
import { fixedIdentity } from './fixtures.ts'

/* The bug this pins: crypto.randomUUID exists only in a secure context, so it is
   present on localhost and missing over plain http to a LAN address. Creating a
   patch threw on any device reaching the dev server by IP. */
describe('id generation without a secure context', () => {
  const realCrypto = globalThis.crypto
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  function withCrypto(replacement: unknown, body: () => void) {
    Object.defineProperty(globalThis, 'crypto', { value: replacement, configurable: true })
    try {
      body()
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true })
    }
  }

  test('falls back to getRandomValues when randomUUID is missing', () => {
    withCrypto({ getRandomValues: realCrypto.getRandomValues.bind(realCrypto) }, () => {
      expect(createPatch({}).id).toMatch(UUID_V4)
    })
  })

  test('still produces an id when crypto is absent entirely', () => {
    withCrypto(undefined, () => {
      expect(createPatch({}).id).toMatch(UUID_V4)
    })
  })

  test('ids stay unique across many calls on the fallback path', () => {
    withCrypto({ getRandomValues: realCrypto.getRandomValues.bind(realCrypto) }, () => {
      const ids = new Set(Array.from({ length: 2000 }, () => createPatch({}).id))
      expect(ids.size).toBe(2000)
    })
  })
})

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
