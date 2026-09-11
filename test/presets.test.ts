import { describe, expect, test } from 'bun:test'
import { PATCH_SCHEMA_VERSION } from '../src/patch/schema.ts'
import { draftFromPreset, factoryPresets, findPreset } from '../src/presets/factory.ts'
import { createMemoryStorage, createWebStorageStore } from '../src/storage/webStorage.ts'
import { fixedIdentity } from './fixtures.ts'

describe('factory presets', () => {
  test('ship with the app and are findable by slug', () => {
    expect(factoryPresets.length).toBeGreaterThan(0)
    expect(findPreset(factoryPresets[0]!.slug)).toBe(factoryPresets[0]!)
    expect(findPreset('nope')).toBeUndefined()
  })

  test('slugs are unique', () => {
    const slugs = factoryPresets.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  test('loading one produces a current-schema patch with a new id', () => {
    const patch = draftFromPreset(factoryPresets[0]!, fixedIdentity())
    expect(patch.schemaVersion).toBe(PATCH_SCHEMA_VERSION)
    expect(patch.id).toBe('id-1')
    expect(patch.name).toBe(factoryPresets[0]!.name)
  })

  test('loading the same preset twice gives two independent patches', () => {
    const identity = fixedIdentity()
    const first = draftFromPreset(factoryPresets[0]!, identity)
    const second = draftFromPreset(factoryPresets[0]!, identity)
    expect(first.id).not.toBe(second.id)
  })

  test('loading a preset does not save it', async () => {
    const store = createWebStorageStore(createMemoryStorage())
    draftFromPreset(factoryPresets[0]!, fixedIdentity())
    expect(await store.list()).toEqual([])
  })
})
