import { beforeEach, describe, expect, test } from 'bun:test'
import { createPatch, type Patch } from '../src/patch/schema.ts'
import { StoreError, type DraftStore, type PatchStore } from '../src/storage/types.ts'
import { createMemoryStorage, createWebStorageStore, type StorageLike } from '../src/storage/webStorage.ts'
import { fixedIdentity } from './fixtures.ts'

let storage: StorageLike
let store: PatchStore & DraftStore

beforeEach(() => {
  storage = createMemoryStorage()
  store = createWebStorageStore(storage)
})

function make(name: string, updatedAt: string): Patch {
  return { ...createPatch({ name }, fixedIdentity(name)), updatedAt }
}

describe('patch store', () => {
  test('saves and reads a patch back unchanged', async () => {
    const patch = make('Bass', '2026-01-02T00:00:00.000Z')
    await store.save(patch)
    expect(await store.get(patch.id)).toEqual(patch)
  })

  test('returns null for an id that was never saved', async () => {
    expect(await store.get('nope')).toBeNull()
  })

  test('lists summaries newest first and without control values', async () => {
    await store.save(make('Older', '2026-01-01T00:00:00.000Z'))
    await store.save(make('Newer', '2026-02-01T00:00:00.000Z'))
    const list = await store.list()
    expect(list.map((s) => s.name)).toEqual(['Newer', 'Older'])
    expect(list[0]).not.toHaveProperty('values')
  })

  test('delete removes only the named patch', async () => {
    const keep = make('Keep', '2026-01-01T00:00:00.000Z')
    const drop = make('Drop', '2026-01-01T00:00:00.000Z')
    await store.save(keep)
    await store.save(drop)
    await store.delete(drop.id)
    expect(await store.get(drop.id)).toBeNull()
    expect(await store.get(keep.id)).not.toBeNull()
  })

  test('one unreadable record does not hide the others', async () => {
    await store.save(make('Good', '2026-01-01T00:00:00.000Z'))
    storage.setItem('moog:patch:broken', '{ not json')
    expect((await store.list()).map((s) => s.name)).toEqual(['Good'])
  })

  test('ignores keys that are not patches', async () => {
    storage.setItem('unrelated', 'x')
    expect(await store.list()).toEqual([])
  })

  test('translates a backend failure into a StoreError', async () => {
    const failing: StorageLike = {
      ...createMemoryStorage(),
      setItem() {
        throw new Error('disk on fire')
      },
    }
    const failingStore = createWebStorageStore(failing)
    await expect(failingStore.save(make('X', '2026-01-01T00:00:00.000Z'))).rejects.toBeInstanceOf(
      StoreError,
    )
  })
})

describe('draft store', () => {
  test('a draft survives a reload and is not listed as a saved patch', async () => {
    const draft = make('In progress', '2026-01-01T00:00:00.000Z')
    await store.writeDraft(draft)
    expect(await createWebStorageStore(storage).readDraft()).toEqual(draft)
    expect(await store.list()).toEqual([])
  })

  test('no draft reads as null', async () => {
    expect(await store.readDraft()).toBeNull()
  })

  test('clearDraft removes it', async () => {
    await store.writeDraft(make('X', '2026-01-01T00:00:00.000Z'))
    await store.clearDraft()
    expect(await store.readDraft()).toBeNull()
  })
})
