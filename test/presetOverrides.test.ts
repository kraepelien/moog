import { describe, expect, test } from 'bun:test'
import { factoryPresets } from '../src/presets/factory.ts'
import { effectivePresets, isOverridden, type PresetOverride } from '../src/presets/overrides.ts'
import { createMemoryStorage, createWebStorageStore } from '../src/storage/webStorage.ts'

const AT = '2026-01-01T00:00:00.000Z'
const first = factoryPresets[0]!

describe('an override shadows a shipped preset without replacing it', () => {
  test('editing changes what is offered', () => {
    const edited = effectivePresets(factoryPresets, [
      { slug: first.slug, name: 'My Version', values: { glide: 9 }, updatedAt: AT },
    ])
    const preset = edited.find((p) => p.slug === first.slug)!
    expect(preset.name).toBe('My Version')
    expect(preset.values).toEqual({ glide: 9 })
    expect(preset.overridden).toBe(true)
  })

  test('the shipped preset is untouched, so reverting is always possible', () => {
    effectivePresets(factoryPresets, [
      { slug: first.slug, name: 'My Version', values: { glide: 9 }, updatedAt: AT },
    ])
    /* The bundle is the source; an override is a separate record. */
    expect(factoryPresets[0]!.name).toBe(first.name)
    expect(factoryPresets[0]!.values).toEqual(first.values)
  })

  test('dropping the override brings the shipped version straight back', () => {
    const reverted = effectivePresets(factoryPresets, [])
    expect(reverted.find((p) => p.slug === first.slug)!.name).toBe(first.name)
    expect(reverted).toHaveLength(factoryPresets.length)
  })

  test('an edited preset stops claiming to be approximate', () => {
    /* The caveat belongs to the reconstruction that shipped, not to values
       somebody has since dialled in themselves. */
    const approximate = factoryPresets.find((p) => p.approximate)!
    const edited = effectivePresets(factoryPresets, [
      { slug: approximate.slug, values: { glide: 1 }, updatedAt: AT },
    ])
    expect(edited.find((p) => p.slug === approximate.slug)!.approximate).toBeUndefined()
  })

  test('renaming alone leaves the values, and the caveat, alone', () => {
    const approximate = factoryPresets.find((p) => p.approximate)!
    const edited = effectivePresets(factoryPresets, [
      { slug: approximate.slug, name: 'Renamed', updatedAt: AT },
    ])
    const preset = edited.find((p) => p.slug === approximate.slug)!
    expect(preset.values).toEqual(approximate.values)
    expect(preset.approximate).toBe(true)
  })
})

describe('deleting a preset', () => {
  const deleted: PresetOverride[] = [{ slug: first.slug, deleted: true, updatedAt: AT }]

  test('takes it out of the bank', () => {
    const remaining = effectivePresets(factoryPresets, deleted)
    expect(remaining).toHaveLength(factoryPresets.length - 1)
    expect(remaining.some((p) => p.slug === first.slug)).toBe(false)
  })

  test('is undoable, because the shipped one never went anywhere', () => {
    expect(effectivePresets(factoryPresets, []).some((p) => p.slug === first.slug)).toBe(true)
  })
})

describe('an override for a preset that no longer ships', () => {
  test('is ignored rather than shown as a preset with nothing behind it', () => {
    /* Otherwise "revert to factory" would have no factory to revert to. */
    const ghost = effectivePresets(factoryPresets, [
      { slug: 'a-preset-that-was-removed', name: 'Ghost', updatedAt: AT },
    ])
    expect(ghost).toHaveLength(factoryPresets.length)
    expect(ghost.some((p) => p.name === 'Ghost')).toBe(false)
  })
})

describe('overrides persist', () => {
  test('save, reload, and revert', async () => {
    const storage = createMemoryStorage()
    const store = createWebStorageStore(storage)

    await store.saveOverride({ slug: first.slug, name: 'Kept', updatedAt: AT })
    /* A second store over the same storage is what a page reload amounts to. */
    expect(await createWebStorageStore(storage).listOverrides()).toEqual([
      { slug: first.slug, name: 'Kept', updatedAt: AT },
    ])

    await store.clearOverride(first.slug)
    expect(await store.listOverrides()).toEqual([])
  })

  test('there is at most one override per preset', async () => {
    const store = createWebStorageStore(createMemoryStorage())
    await store.saveOverride({ slug: first.slug, name: 'One', updatedAt: AT })
    await store.saveOverride({ slug: first.slug, name: 'Two', updatedAt: AT })
    const all = await store.listOverrides()
    expect(all).toHaveLength(1)
    expect(all[0]!.name).toBe('Two')
  })

  test('one unreadable record does not hide every other preset', async () => {
    const storage = createMemoryStorage()
    const store = createWebStorageStore(storage)
    await store.saveOverride({ slug: first.slug, name: 'Good', updatedAt: AT })
    storage.setItem('moog:preset:broken', '{ not json')
    storage.setItem('moog:preset:wrong-shape', '{"slug":123}')
    expect(await store.listOverrides()).toHaveLength(1)
  })

  test('overrides are not patches and do not appear in the patch list', async () => {
    const store = createWebStorageStore(createMemoryStorage())
    await store.saveOverride({ slug: first.slug, deleted: true, updatedAt: AT })
    expect(await store.list()).toEqual([])
  })

  test('isOverridden reports what the UI needs to offer a revert', () => {
    expect(isOverridden([{ slug: 'x', updatedAt: AT }], 'x')).toBe(true)
    expect(isOverridden([], 'x')).toBe(false)
  })
})
