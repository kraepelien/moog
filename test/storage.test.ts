import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
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

describe('patches are files in a folder', () => {
  test('saving one writes a file named by its id', async () => {
    const patch = make('Bass', '2026-01-02T00:00:00.000Z')
    await api.store.save(patch)
    const file = join(api.root, 'patches', `${patch.id}.json`)
    expect(existsSync(file)).toBe(true)
    /* Readable and hand-editable, which is the point of files over a database. */
    expect(JSON.parse(readFileSync(file, 'utf8')).name).toBe('Bass')
  })

  test('reads back unchanged', async () => {
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

  test('delete removes only the named file', async () => {
    const keep = make('Keep', '2026-01-01T00:00:00.000Z')
    const drop = make('Drop', '2026-01-01T00:00:00.000Z')
    await api.store.save(keep)
    await api.store.save(drop)
    await api.store.delete(drop.id)
    expect(await api.store.get(drop.id)).toBeNull()
    expect(await api.store.get(keep.id)).not.toBeNull()
  })

  test('a file edited by hand into nonsense does not hide the others', async () => {
    await api.store.save(make('Good', '2026-01-01T00:00:00.000Z'))
    mkdirSync(join(api.root, 'patches'), { recursive: true })
    writeFileSync(join(api.root, 'patches', 'broken.json'), '{ not json', 'utf8')
    expect((await api.store.list()).map((s) => s.name)).toEqual(['Good'])
  })

  test('files that are not JSON are ignored', async () => {
    mkdirSync(join(api.root, 'patches'), { recursive: true })
    writeFileSync(join(api.root, 'patches', 'notes.txt'), 'hello', 'utf8')
    expect(await api.store.list()).toEqual([])
  })
})

describe('an id becomes a filename, so it is checked first', () => {
  test('a traversing id cannot reach outside the folder', async () => {
    /* Without the check, this would read or write above the data folder. The
       pattern is what prevents it, not the path join. */
    await expect(api.store.get('../../etc/passwd')).rejects.toBeInstanceOf(StoreError)
    await expect(api.store.delete('../../secrets')).rejects.toBeInstanceOf(StoreError)
  })

  test('a slug with a slash is refused too', async () => {
    await expect(api.store.deletePreset('a/b')).rejects.toBeInstanceOf(StoreError)
  })
})

describe('the working draft', () => {
  test('survives a reload and is not listed as a saved patch', async () => {
    const draft = make('In progress', '2026-01-01T00:00:00.000Z')
    await api.store.writeDraft(draft)
    expect(await api.store.readDraft()).toEqual(draft)
    expect(await api.store.list()).toEqual([])
  })

  test('no draft reads as null', async () => {
    expect(await api.store.readDraft()).toBeNull()
  })

  test('clearing it removes the file', async () => {
    await api.store.writeDraft(make('X', '2026-01-01T00:00:00.000Z'))
    await api.store.clearDraft()
    expect(await api.store.readDraft()).toBeNull()
    expect(existsSync(join(api.root, 'draft.json'))).toBe(false)
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
