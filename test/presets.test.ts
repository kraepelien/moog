import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadFactory } from '@server/factory.ts'
import { createPatches } from '@server/repositories/patches.ts'
import { createRepositories } from '@server/repositories/index.ts'
import { PATCH_SCHEMA_VERSION, createPatch, parsePatch, type Patch } from '@patch/schema.ts'
import { copyOf } from '@presets/preset.ts'
import { testApi, type TestApi } from './apiFixture.ts'
import { fixedIdentity } from './fixtures.ts'

let api: TestApi
beforeEach(() => {
  api = testApi()
})
afterEach(() => {
  api.cleanup()
})

const SEED = 'presets'
const files = () => readdirSync(SEED).filter((file) => file.endsWith('.json'))

function aPreset(slug: string, name = slug): Patch {
  return { ...createPatch({ name, values: { glide: 4 }, visibility: 'public' }), id: slug }
}

function aBank(dir: string, presets: Record<string, Patch>): string {
  mkdirSync(dir, { recursive: true })
  for (const [slug, patch] of Object.entries(presets)) {
    writeFileSync(join(dir, `${slug}.json`), JSON.stringify(patch), 'utf8')
  }
  return dir
}

describe('the bank shipped in the repo', () => {
  test('is a folder of one file per preset', () => {
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
      const preset = JSON.parse(readFileSync(join(SEED, file), 'utf8'))
      expect([file, preset.id]).toEqual([file, file.slice(0, -'.json'.length)])
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
  test('every preset wears a category', () => {
    for (const file of files()) {
      const preset = JSON.parse(readFileSync(join(SEED, file), 'utf8'))
      expect([file, preset.tags.length > 0]).toEqual([file, true])
    }
  })

  test('the whole bank is public, and says its values are a reconstruction', () => {
    for (const file of files()) {
      const preset = JSON.parse(readFileSync(join(SEED, file), 'utf8'))
      expect([file, preset.visibility]).toEqual([file, 'public'])
      expect([file, preset.approximate]).toEqual([file, true])
    }
  })
})

describe('loading the bank into the database', () => {
  test('brings in every file', async () => {
    const result = loadFactory(api.db, SEED)
    expect(result.loaded).toBe(files().length)
    expect(await api.store.listPresets()).toHaveLength(files().length)
  })

  test('twice writes nothing the second time', async () => {
    loadFactory(api.db, SEED)
    const again = loadFactory(api.db, SEED)
    expect(again.loaded).toBe(0)
    expect(again.kept).toBe(files().length)
    expect(await api.store.listPresets()).toHaveLength(files().length)
  })

  /* The rows are the live bank, so an administrator's correction has to survive
     a restart. That is the whole reason this seeds rather than re-asserts. */
  test('leaves a preset the database already holds alone', async () => {
    const bank = aBank(join(api.root, 'bank'), { one: aPreset('one', 'First') })
    loadFactory(api.db, bank)

    aBank(bank, { one: { ...aPreset('one', 'Second'), values: { glide: 9 } } })
    const again = loadFactory(api.db, bank)

    expect([again.loaded, again.kept]).toEqual([0, 1])
    const presets = await api.store.listPresets()
    expect(presets[0]!.name).toBe('First')
  })

  /* Asked for out loud, and destructive on purpose: it is how the repo's copy
     is put back over whatever the rows have become. */
  test('reseeding writes the file back over the row', async () => {
    const bank = aBank(join(api.root, 'bank'), { one: aPreset('one', 'First') })
    loadFactory(api.db, bank)

    aBank(bank, { one: { ...aPreset('one', 'Second'), values: { glide: 9 } } })
    const again = loadFactory(api.db, bank, { reseed: true })

    expect([again.loaded, again.kept]).toEqual([1, 0])
    const presets = await api.store.listPresets()
    expect(presets).toHaveLength(1)
    expect(presets[0]!.name).toBe('Second')
    expect(presets[0]!.values).toEqual({ glide: 9 })
  })

  /* A preset taken out of the bank on purpose must not walk back in at the next
     start just because its file is still in the image. */
  test('does not bring back one that was retired', async () => {
    const bank = aBank(join(api.root, 'bank'), { one: aPreset('one') })
    loadFactory(api.db, bank)
    createPatches(api.db).deletePreset('one')

    const again = loadFactory(api.db, bank)
    expect([again.loaded, again.kept]).toEqual([0, 1])
    expect(await api.store.listPresets()).toHaveLength(0)
  })

  test('a preset the image no longer ships is retired', async () => {
    const bank = aBank(join(api.root, 'bank'), {
      keep: aPreset('keep'),
      drop: aPreset('drop'),
    })
    loadFactory(api.db, bank)

    aBank(join(api.root, 'bank2'), { keep: aPreset('keep') })
    const result = loadFactory(api.db, join(api.root, 'bank2'))

    expect(result.retired).toBe(1)
    expect((await api.store.listPresets()).map((preset) => preset.id)).toEqual(['keep'])
  })

  test('a file that will not parse stops the start rather than half-loading', async () => {
    /* A bad file in the bank is a mistake in the repo, and one nobody can fix
       by reloading the page. */
    const bank = aBank(join(api.root, 'bank'), { good: aPreset('good') })
    writeFileSync(join(bank, 'broken.json'), '{"id": 123}', 'utf8')
    expect(() => loadFactory(api.db, bank)).toThrow(/broken.json/)
  })

  test('a bank that is not there loads nothing rather than failing', () => {
    expect(loadFactory(api.db, join(api.root, 'no-such-bank')))
      .toEqual({ loaded: 0, kept: 0, retired: 0 })
  })

  test('presets are not patches and never appear in the patch list', async () => {
    loadFactory(api.db, SEED)
    expect(await api.store.list()).toEqual([])
  })
})

describe('a factory row', () => {
  test('keeps its identity through a reload of the bank', () => {
    /* The uid is minted once; the slug is what the bank matches on, so a
       preset keeps its row across restarts and across installs. */
    const bank = aBank(join(api.root, 'bank'), { one: aPreset('one', 'First') })
    loadFactory(api.db, bank)
    const first = createRepositories(api.db).patches.listPresets()[0]!

    loadFactory(api.db, bank)
    const again = createRepositories(api.db).patches.listPresets()[0]!
    expect(again.id).toBe(first.id)
  })

  test('has no owner, which is what makes it the bank', () => {
    loadFactory(api.db, SEED)
    const found = createRepositories(api.db).patches.locate('sub-bass')
    expect(found?.ownerId).toBeNull()
    expect(found?.slug).toBe('sub-bass')
  })
})

describe('copying a preset, which is the only way to save one', () => {
  test('makes a new patch rather than adopting the one it came from', () => {
    const patch = copyOf(aPreset('my-sound', 'My Sound'), { owner: null }, fixedIdentity())
    expect(patch.schemaVersion).toBe(PATCH_SCHEMA_VERSION)
    expect(patch.id).not.toBe('my-sound')
    expect(patch.name).toBe('My Sound')
  })

  test('twice gives two independent patches', () => {
    const identity = fixedIdentity()
    const preset = aPreset('my-sound')
    expect(copyOf(preset, {}, identity).id).not.toBe(copyOf(preset, {}, identity).id)
  })

  test('the copy is private, whatever it was copied from', () => {
    expect(copyOf(aPreset('my-sound'), { owner: null }, fixedIdentity()).visibility).toBe('private')
  })

  test('the copy records what it came from', () => {
    const copy = copyOf(aPreset('sub-bass', 'Sub Bass'), { owner: null }, fixedIdentity())
    expect(copy.derivedFrom).toMatchObject({ id: 'sub-bass', name: 'Sub Bass', kind: 'factory' })
  })

  test('a copy of a copy names its immediate parent, not the original', () => {
    const identity = fixedIdentity()
    const first = copyOf(aPreset('sub-bass', 'Sub Bass'), { owner: null }, identity)
    const second = copyOf(
      { ...first, name: 'Mine' },
      { owner: { id: 'u1', name: 'Peter' } },
      identity,
    )
    expect(second.derivedFrom?.id).toBe(first.id)
    expect(second.derivedFrom?.ownerName).toBe('Peter')
  })

  test('does not save anything', async () => {
    copyOf(aPreset('my-sound'), {}, fixedIdentity())
    expect(await api.store.list()).toEqual([])
  })
})
