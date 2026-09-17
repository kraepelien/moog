import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createPatch, type Patch } from '@patch/schema.ts'
import { StoreError } from '@storage/types.ts'
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
  test('creating one and reading it back gives the same patch', async () => {
    const stored = await api.store.create(make('Bass', '2026-01-02T00:00:00.000Z'))
    expect(await api.store.get(stored.id)).toEqual(stored)
  })

  test('the server mints the id, not the caller', async () => {
    /* A client cannot choose an id that collides, nor bring back one it
       deleted. */
    const asked = make('Bass', '2026-01-02T00:00:00.000Z')
    const stored = await api.store.create(asked)
    expect(stored.id).not.toBe(asked.id)
  })

  test('an id that was never saved reads as null, not an error', async () => {
    expect(await api.store.get('never-saved')).toBeNull()
  })

  test('lists newest first, without the control values', async () => {
    const older = await api.store.create(make('Older', '2026-01-01T00:00:00.000Z'))
    await api.store.create(make('Newer', '2026-02-01T00:00:00.000Z'))
    /* The server stamps its own times on create, so the older one is made
       older deliberately rather than by the order they were written. */
    await api.store.save({ ...older, updatedAt: '2020-01-01T00:00:00.000Z' })

    const list = await api.store.list()
    expect(list.map((entry) => entry.name)).toEqual(['NEWER', 'OLDER'])
    expect(list[0]).not.toHaveProperty('values')
  })

  /* The library filters on these without fetching each patch, so dropping one
     from the summary would quietly stop a chip from reaching a saved patch
     rather than failing anywhere. */
  test('a summary carries what the library filters on', async () => {
    const patch = {
      ...make('Tagged', '2026-01-01T00:00:00.000Z'),
      tags: ['bass', 'lead'],
      visibility: 'public' as const,
    }
    await api.store.create(patch)
    const [summary] = await api.store.list()
    expect(summary).toMatchObject({
      name: 'TAGGED',
      tags: ['bass', 'lead'],
      instrument: patch.instrument,
      visibility: 'public',
    })
  })

  test('delete removes only the one named', async () => {
    const keep = await api.store.create(make('Keep', '2026-01-01T00:00:00.000Z'))
    const drop = await api.store.create(make('Drop', '2026-01-01T00:00:00.000Z'))
    await api.store.delete(drop.id)
    expect(await api.store.get(drop.id)).toBeNull()
    expect(await api.store.get(keep.id)).not.toBeNull()
  })

  test('a deleted patch stays gone across a reload', async () => {
    const patch = await api.store.create(make('Gone', '2026-01-01T00:00:00.000Z'))
    await api.store.delete(patch.id)
    expect(await api.store.get(patch.id)).toBeNull()
    expect(await api.store.list()).toEqual([])
  })

  test('saving over one replaces it rather than adding a second', async () => {
    const patch = await api.store.create(make('First', '2026-01-01T00:00:00.000Z'))
    await api.store.save({ ...patch, name: 'Second' })
    const list = await api.store.list()
    expect(list.map((entry) => entry.name)).toEqual(['SECOND'])
  })
})

describe('an id arriving from a URL is checked before it is used', () => {
  test('one that is not a word is refused', async () => {
    await expect(api.store.get('../../etc/passwd')).rejects.toBeInstanceOf(StoreError)
    await expect(api.store.delete('../../secrets')).rejects.toBeInstanceOf(StoreError)
  })

  test('a patch id with a slash is refused too', async () => {
    await expect(api.store.get('a/b')).rejects.toBeInstanceOf(StoreError)
  })
})

describe('when the server is not answering', () => {
  test('the failure says so rather than surfacing as a parse error', async () => {
    const { createHttpStore } = await import('@storage/httpStore.ts')
    const offline = createHttpStore(() => Promise.reject(new Error('connection refused')))
    await expect(offline.list()).rejects.toMatchObject({
      name: 'StoreError',
      kind: 'unavailable',
    })
  })
})
