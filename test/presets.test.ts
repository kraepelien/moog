import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { seedPresets } from '../server/seed.ts'
import { PATCH_SCHEMA_VERSION } from '../src/patch/schema.ts'
import { draftFromPreset, presetSchema, type StoredPreset } from '../src/presets/preset.ts'
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

function aPreset(slug: string, name = slug): StoredPreset {
  return { slug, name, notes: '', values: { glide: 4 } }
}

describe('the bank shipped in the repo', () => {
  test('is a folder of one file per preset', () => {
    const files = readdirSync(SEED).filter((f) => f.endsWith('.json'))
    expect(files.length).toBeGreaterThan(0)
  })

  test('every file is a valid preset', () => {
    for (const file of readdirSync(SEED).filter((f) => f.endsWith('.json'))) {
      const parsed = presetSchema.safeParse(JSON.parse(readFileSync(join(SEED, file), 'utf8')))
      expect([file, parsed.success]).toEqual([file, true])
    }
  })

  test('each file is named after the slug inside it', () => {
    /* The filename is the key the API addresses it by, so the two drifting apart
       would make a preset unreachable under its own name. */
    for (const file of readdirSync(SEED).filter((f) => f.endsWith('.json'))) {
      const preset = JSON.parse(readFileSync(join(SEED, file), 'utf8'))
      expect([file, preset.slug]).toEqual([file, file.slice(0, -'.json'.length)])
    }
  })
})

describe('seeding the active folder', () => {
  test('copies the shipped bank in on first run', async () => {
    const active = join(api.root, 'presets')
    const result = await seedPresets(SEED, active)
    const shipped = readdirSync(SEED).filter((f) => f.endsWith('.json')).length
    expect(result.seeded).toHaveLength(shipped)
    expect(await api.store.listPresets()).toHaveLength(shipped)
  })

  test('copies nothing on later runs', async () => {
    const active = join(api.root, 'presets')
    await seedPresets(SEED, active)
    const again = await seedPresets(SEED, active)
    expect(again.seeded).toEqual([])
  })

  test('the bookkeeping file is not offered as a preset', async () => {
    /* It ends in .json and sits in the same folder, so nothing but an explicit
       rule keeps it out of the bank. */
    const active = join(api.root, 'presets')
    await seedPresets(SEED, active)
    expect(existsSync(join(active, '.seeded.json'))).toBe(true)
    expect((await api.store.listPresets()).some((p) => p.slug === '.seeded')).toBe(false)
  })

  test('a preset added to the shipped bank later does arrive', async () => {
    /* The reason the manifest lists slugs rather than setting a done flag: an
       image that gains a preset must be able to deliver it to a folder that has
       already been seeded once. */
    const active = join(api.root, 'presets')
    await seedPresets(SEED, active)

    const laterBank = join(api.root, 'later-bank')
    mkdirSync(laterBank, { recursive: true })
    writeFileSync(join(laterBank, 'brand-new.json'), JSON.stringify(aPreset('brand-new')), 'utf8')

    const result = await seedPresets(laterBank, active)
    expect(result.seeded).toEqual(['brand-new'])
    expect((await api.store.listPresets()).some((p) => p.slug === 'brand-new')).toBe(true)
  })

  test('a preset deleted after seeding does not come back', async () => {
    const active = join(api.root, 'presets')
    await seedPresets(SEED, active)
    const first = (await api.store.listPresets())[0]!
    await api.store.deletePreset(first.slug)

    await seedPresets(SEED, active)
    expect((await api.store.listPresets()).some((p) => p.slug === first.slug)).toBe(false)
  })

  test('never overwrites a file already there', async () => {
    const active = join(api.root, 'presets')
    mkdirSync(active, { recursive: true })
    const shipped = readdirSync(SEED).filter((f) => f.endsWith('.json'))[0]!
    writeFileSync(join(active, shipped), JSON.stringify(aPreset(shipped.slice(0, -5), 'Mine')), 'utf8')

    await seedPresets(SEED, active)
    const kept = (await api.store.listPresets()).find((p) => p.slug === shipped.slice(0, -5))
    expect(kept?.name).toBe('Mine')
  })
})

describe('presets are editable files', () => {
  test('saving one writes a file named by its slug', async () => {
    await api.store.savePreset(aPreset('my-sound', 'My Sound'))
    expect(existsSync(join(api.root, 'presets', 'my-sound.json'))).toBe(true)
  })

  test('overwriting replaces what is there', async () => {
    await api.store.savePreset(aPreset('my-sound', 'First'))
    await api.store.savePreset({ ...aPreset('my-sound', 'Second'), values: { glide: 9 } })
    const all = await api.store.listPresets()
    expect(all).toHaveLength(1)
    expect(all[0]!.name).toBe('Second')
    expect(all[0]!.values).toEqual({ glide: 9 })
  })

  test('deleting removes the file', async () => {
    await api.store.savePreset(aPreset('my-sound'))
    await api.store.deletePreset('my-sound')
    expect(await api.store.listPresets()).toEqual([])
    expect(existsSync(join(api.root, 'presets', 'my-sound.json'))).toBe(false)
  })

  test('a preset that will not parse is skipped, not fatal', async () => {
    await api.store.savePreset(aPreset('good'))
    mkdirSync(join(api.root, 'presets'), { recursive: true })
    writeFileSync(join(api.root, 'presets', 'broken.json'), '{ not json', 'utf8')
    writeFileSync(join(api.root, 'presets', 'wrong.json'), '{"slug":123}', 'utf8')
    expect((await api.store.listPresets()).map((p) => p.slug)).toEqual(['good'])
  })

  test('presets are not patches and never appear in the patch list', async () => {
    await api.store.savePreset(aPreset('my-sound'))
    expect(await api.store.list()).toEqual([])
  })
})

describe('loading a preset', () => {
  test('makes a new patch rather than adopting the preset', () => {
    const patch = draftFromPreset(aPreset('my-sound', 'My Sound'), fixedIdentity())
    expect(patch.schemaVersion).toBe(PATCH_SCHEMA_VERSION)
    expect(patch.id).toBe('id-1')
    expect(patch.name).toBe('My Sound')
  })

  test('twice gives two independent patches', () => {
    const identity = fixedIdentity()
    const preset = aPreset('my-sound')
    expect(draftFromPreset(preset, identity).id).not.toBe(draftFromPreset(preset, identity).id)
  })

  test('does not save anything', async () => {
    draftFromPreset(aPreset('my-sound'), fixedIdentity())
    expect(await api.store.list()).toEqual([])
  })
})
