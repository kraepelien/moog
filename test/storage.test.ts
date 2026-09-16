import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createPatch, type Patch } from '../src/patch/schema.ts'
import { StoreError } from '../src/storage/types.ts'
import { testApi, type TestApi } from './apiFixture.ts'
import { fixedIdentity } from './fixtures.ts'

let api: TestApi

beforeEach(() => {
  api = testApi()
})
afterEach(() => {
  api.cleanup()
})

function make(name: string, updatedAt: string): Patch {
  return { ...createPatch({ name }, fixedIdentity(name)), updatedAt }
}

describe('patches are rows', () => {
  test('saving one and reading it back gives the same patch', async () => {
    const patch = make('Bass', '2026-01-02T00:00:00.000Z')
    await api.store.save(patch)
    expect(await api.store.get(patch.id)).toEqual(patch)
  })

  test('an id that was never saved reads as null, not an error', async () => {
    expect(await api.store.get('never-saved')).toBeNull()
  })

  test('lists newest first, without the control values', async () => {
    await api.store.save(make('Older', '2026-01-01T00:00:00.000Z'))
    await api.store.save(make('Newer', '2026-02-01T00:00:00.000Z'))
    const list = await api.store.list()
    expect(list.map((s) => s.name)).toEqual(['Newer', 'Older'])
    expect(list[0]).not.toHaveProperty('values')
  })

  test('delete removes only the one named', async () => {
    const keep = make('Keep', '2026-01-01T00:00:00.000Z')
    const drop = make('Drop', '2026-01-01T00:00:00.000Z')
    await api.store.save(keep)
    await api.store.save(drop)
    await api.store.delete(drop.id)
    expect(await api.store.get(drop.id)).toBeNull()
    expect(await api.store.get(keep.id)).not.toBeNull()
  })

  test('a deleted patch stays gone across a reload', async () => {
    const patch = make('Gone', '2026-01-01T00:00:00.000Z')
    await api.store.save(patch)
    await api.store.delete(patch.id)
    expect(await api.store.get(patch.id)).toBeNull()
    expect(await api.store.list()).toEqual([])
  })

  test('saving over one replaces it rather than adding a second', async () => {
    const patch = make('First', '2026-01-01T00:00:00.000Z')
    await api.store.save(patch)
    await api.store.save({ ...patch, name: 'Second' })
    const list = await api.store.list()
    expect(list.map((entry) => entry.name)).toEqual(['Second'])
  })
})

describe('an id arriving from a URL is checked before it is used', () => {
  test('one that is not a word is refused', async () => {
    await expect(api.store.get('../../etc/passwd')).rejects.toBeInstanceOf(StoreError)
    await expect(api.store.delete('../../secrets')).rejects.toBeInstanceOf(StoreError)
  })

  test('a slug with a slash is refused too', async () => {
    await expect(api.store.deletePreset('a/b')).rejects.toBeInstanceOf(StoreError)
  })
})

describe('when the server is not answering', () => {
  test('the failure says so rather than surfacing as a parse error', async () => {
    const { createHttpStore } = await import('../src/storage/httpStore.ts')
    const offline = createHttpStore(() => Promise.reject(new Error('connection refused')))
    await expect(offline.list()).rejects.toMatchObject({
      name: 'StoreError',
      kind: 'unavailable',
    })
  })
})
