import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadFactory } from '@server/factory.ts'
import { createPatches } from '@server/repositories/patches.ts'
import { createRepositories } from '@server/repositories/index.ts'
import { PATCH_SCHEMA_VERSION, createPatch, parsePatch, type Patch } from '@patch/schema.ts'
import { copyOf } from '@patch/copy.ts'
import { testApi, type TestApi } from './apiFixture.ts'
import { fixedIdentity } from './fixtures.ts'

let api: TestApi
beforeEach(() => {
  api = testApi()
})
afterEach(() => {
  api.cleanup()
})

const SEED = 'bank'
const files = () => readdirSync(SEED).filter((file) => file.endsWith('.json'))

function aFactoryPatch(slug: string, name = slug): Patch {
  return { ...createPatch({ name, values: { glide: 4 }, visibility: 'public' }), id: slug }
}

function aBank(dir: string, patches: Record<string, Patch>): string {
  mkdirSync(dir, { recursive: true })
  for (const [slug, patch] of Object.entries(patches)) {
    writeFileSync(join(dir, `${slug}.json`), JSON.stringify(patch), 'utf8')
  }
  return dir
}

describe('the bank shipped in the repo', () => {
  test('is a folder of one file per patch', () => {
    expect(files().length).toBeGreaterThan(0)
  })

  test('every file is a valid patch, by the one schema there is', () => {
    for (const file of files()) {
      const parsed = parsePatch(JSON.parse(readFileSync(join(SEED, file), 'utf8')))
      expect([file, parsed.ok]).toEqual([file, true])
    }
  })

  test('each file is named after the id inside it', () => {
    for (const file of files()) {
      const patch = JSON.parse(readFileSync(join(SEED, file), 'utf8'))
      expect([file, patch.id]).toEqual([file, file.slice(0, -'.json'.length)])
    }
  })

  /* Capitals are the panel's typesetting and belong to the stylesheet, so a
     bank file keeps the name as it is written. A loader that capitalised on the
     way in would leave the repo saying one thing and the database another. */
  test('every name reaches the database as it is written in the file', () => {
    for (const file of files()) {
      const raw = JSON.parse(readFileSync(join(SEED, file), 'utf8'))
      const parsed = parsePatch(raw)
      expect([file, parsed.ok && parsed.value.name]).toEqual([file, raw.name])
    }
  })

  /* The whole bank is categorised, which is what makes the library's Category
     row worth drawing on a fresh install. */
  test('every patch wears a category', () => {
    for (const file of files()) {
      const patch = JSON.parse(readFileSync(join(SEED, file), 'utf8'))
      expect([file, patch.tags.length > 0]).toEqual([file, true])
    }
  })

  test('the whole bank is public, and says its values are a reconstruction', () => {
    for (const file of files()) {
      const patch = JSON.parse(readFileSync(join(SEED, file), 'utf8'))
      expect([file, patch.visibility]).toEqual([file, 'public'])
      expect([file, patch.approximate]).toEqual([file, true])
    }
  })
})

describe('loading the bank into the database', () => {
  test('brings in every file', async () => {
    const result = loadFactory(api.db, SEED)
    expect(result.loaded).toBe(files().length)
    expect(createRepositories(api.db).patches.listFactory()).toHaveLength(files().length)
  })

  test('twice writes nothing the second time', async () => {
    loadFactory(api.db, SEED)
    const again = loadFactory(api.db, SEED)
    expect(again.loaded).toBe(0)
    expect(again.kept).toBe(files().length)
    expect(createRepositories(api.db).patches.listFactory()).toHaveLength(files().length)
  })

  /* The rows are the live bank, so an administrator's correction has to survive
     a restart. That is the whole reason this seeds rather than re-asserts. */
  test('leaves a patch the database already holds alone', async () => {
    const bank = aBank(join(api.root, 'bank'), { one: aFactoryPatch('one', 'First') })
    loadFactory(api.db, bank)

    aBank(bank, { one: { ...aFactoryPatch('one', 'Second'), values: { glide: 9 } } })
    const again = loadFactory(api.db, bank)

    expect([again.loaded, again.kept]).toEqual([0, 1])
    const rows = createRepositories(api.db).patches.listFactory()
    expect(rows[0]!.name).toBe('First')
  })

  /* Asked for out loud, and destructive on purpose: it is how the repo's copy
     is put back over whatever the rows have become. */
  test('reseeding writes the file back over the row', async () => {
    const bank = aBank(join(api.root, 'bank'), { one: aFactoryPatch('one', 'First') })
    loadFactory(api.db, bank)

    aBank(bank, { one: { ...aFactoryPatch('one', 'Second'), values: { glide: 9 } } })
    const again = loadFactory(api.db, bank, { reseed: true })

    expect([again.loaded, again.kept]).toEqual([1, 0])
    const rows = createRepositories(api.db).patches.listFactory()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('Second')
    expect(rows[0]!.values).toEqual({ glide: 9 })
  })

  /* A patch taken out of the bank on purpose must not walk back in at the next
     start just because its file is still in the image. */
  test('does not bring back one that was retired', async () => {
    const bank = aBank(join(api.root, 'bank'), { one: aFactoryPatch('one') })
    loadFactory(api.db, bank)
    createPatches(api.db).deleteFactory('one')

    const again = loadFactory(api.db, bank)
    expect([again.loaded, again.kept]).toEqual([0, 1])
    expect(createRepositories(api.db).patches.listFactory()).toHaveLength(0)
  })

  test('a patch the image no longer ships is retired', async () => {
    const bank = aBank(join(api.root, 'bank'), {
      keep: aFactoryPatch('keep'),
      drop: aFactoryPatch('drop'),
    })
    loadFactory(api.db, bank)

    aBank(join(api.root, 'bank2'), { keep: aFactoryPatch('keep') })
    const result = loadFactory(api.db, join(api.root, 'bank2'))

    expect(result.retired).toBe(1)
    expect(createRepositories(api.db).patches.listFactory().map((patch) => patch.id)).toEqual(['keep'])
  })

  test('a file that will not parse stops the start rather than half-loading', async () => {
    /* A bad file in the bank is a mistake in the repo, and one nobody can fix
       by reloading the page. */
    const bank = aBank(join(api.root, 'bank'), { good: aFactoryPatch('good') })
    writeFileSync(join(bank, 'broken.json'), '{"id": 123}', 'utf8')
    expect(() => loadFactory(api.db, bank)).toThrow(/broken.json/)
  })

  test('a bank that is not there loads nothing rather than failing', () => {
    expect(loadFactory(api.db, join(api.root, 'no-such-bank')))
      .toEqual({ loaded: 0, kept: 0, retired: 0 })
  })

  test('a factory patch never appears in the saved-patch list', async () => {
    loadFactory(api.db, SEED)
    expect(await api.store.list()).toEqual([])
  })
})

describe('a factory row', () => {
  test('keeps its identity through a reload of the bank', () => {
    /* The uid is minted once; the slug is what the bank matches on, so a
       factory patch keeps its row across restarts and across installs. */
    const bank = aBank(join(api.root, 'bank'), { one: aFactoryPatch('one', 'First') })
    loadFactory(api.db, bank)
    const first = createRepositories(api.db).patches.listFactory()[0]!

    loadFactory(api.db, bank)
    const again = createRepositories(api.db).patches.listFactory()[0]!
    expect(again.id).toBe(first.id)
  })

  test('has no owner, which is what makes it the bank', () => {
    loadFactory(api.db, SEED)
    const found = createRepositories(api.db).patches.locate('sub-bass')
    expect(found?.ownerId).toBeNull()
    expect(found?.slug).toBe('sub-bass')
  })
})

describe('copying a factory patch, which is the only way to save one', () => {
  test('makes a new patch rather than adopting the one it came from', () => {
    const patch = copyOf(aFactoryPatch('my-sound', 'My Sound'), { owner: null }, fixedIdentity())
    expect(patch.schemaVersion).toBe(PATCH_SCHEMA_VERSION)
    expect(patch.id).not.toBe('my-sound')
    expect(patch.name).toBe('My Sound')
  })

  test('twice gives two independent patches', () => {
    const identity = fixedIdentity()
    const patch = aFactoryPatch('my-sound')
    expect(copyOf(patch, {}, identity).id).not.toBe(copyOf(patch, {}, identity).id)
  })

  test('the copy is private, whatever it was copied from', () => {
    expect(copyOf(aFactoryPatch('my-sound'), { owner: null }, fixedIdentity()).visibility).toBe('private')
  })

  test('the copy records what it came from', () => {
    const copy = copyOf(aFactoryPatch('sub-bass', 'Sub Bass'), { owner: null }, fixedIdentity())
    expect(copy.derivedFrom).toMatchObject({ id: 'sub-bass', name: 'Sub Bass', kind: 'factory' })
  })

  test('a copy of a copy names its immediate parent, not the original', () => {
    const identity = fixedIdentity()
    const first = copyOf(aFactoryPatch('sub-bass', 'Sub Bass'), { owner: null }, identity)
    const second = copyOf(
      { ...first, name: 'Mine' },
      { owner: { id: 'u1', name: 'Peter' } },
      identity,
    )
    expect(second.derivedFrom?.id).toBe(first.id)
    expect(second.derivedFrom?.ownerName).toBe('Peter')
  })

  test('does not save anything', async () => {
    copyOf(aFactoryPatch('my-sound'), {}, fixedIdentity())
    expect(await api.store.list()).toEqual([])
  })
})
