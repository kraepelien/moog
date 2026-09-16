import { describe, expect, test } from 'bun:test'
import { panelRegistry } from '../src/controls/panel.ts'
import { defaultValues } from '../src/controls/registry.ts'
import { mergeValues, resolvePatch } from '../src/patch/resolve.ts'
import { createPatch, type Patch } from '../src/patch/schema.ts'
import { copyOf } from '../src/presets/preset.ts'
import { testApi } from './apiFixture.ts'
import { createBundle, parseBundle, serializeBundle } from '../src/transfer/bundle.ts'
import { fixedIdentity, testRegistry } from './fixtures.ts'

/* Drives one patch through every seam the app has: draft, edit, persist, reload,
   save, export to a file, import it back, and resolve it against a registry that
   has since gained a control and lost another. */
describe('patch lifecycle', () => {
  test('a patch survives the whole round trip, including a registry that changed', async () => {
    const api = testApi()
    const store = api.store
    const registry = testRegistry()

    /* Start from a preset. It must not be saved by loading it.

       Declared here rather than taken from the shipped bank: this is a test of
       the storage lifecycle against a two-control test registry, and pulling a
       real preset would make it depend on which sound happens to be first and
       on every value that sound carries. */
    const preset = createPatch(
      { name: 'Test Preset', visibility: 'public' },
      fixedIdentity('preset'),
    )
    let draft = copyOf(preset, { owner: null }, fixedIdentity('draft'))
    expect(await store.list()).toEqual([])

    // Edit the panel. Values start from registry defaults.
    const edited = { ...defaultValues(registry), testVolume: 8 }
    draft = { ...draft, name: 'Round Trip', values: mergeValues(panelRegistry, draft, edited) }

    /* Nothing is stored until Save: editing the panel writes nothing. */
    expect(await store.list()).toEqual([])

    await store.save(draft)
    const list = await store.list()
    expect(list.map((s) => s.name)).toEqual(['Round Trip'])
    expect((await store.get(draft.id))!.values.testVolume).toBe(8)

    // Export, then import into a different machine's empty store.
    const file = serializeBundle(createBundle([(await store.get(draft.id))!], fixedIdentity('exp')))
    const other = testApi()
    const otherStore = other.store
    const parsed = parseBundle(file, fixedIdentity('imp'))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    for (const patch of parsed.value.patches) await otherStore.save(patch)

    const imported = (await otherStore.get(parsed.value.patches[0]!.id))!
    expect(imported.name).toBe('Round Trip')
    expect(imported.id).not.toBe(draft.id)

    // Resolve against a registry that has gained a control the file predates and
    // no longer has one the file carries.
    const futureRegistry = testRegistry()
    const withStaleValue: Patch = {
      ...imported,
      values: { ...imported.values, retiredKnob: 'still here' },
    }
    const { values, report } = resolvePatch(futureRegistry, withStaleValue)

    expect(values.testVolume).toBe(8)
    expect(values.testRange).toBe('lo')
    expect(report.unknown).toEqual(['retiredKnob'])
    expect(values).not.toHaveProperty('retiredKnob')

    // Saving after that must not drop the value the registry did not recognise.
    const resaved = { ...withStaleValue, values: mergeValues(panelRegistry, withStaleValue, values) }
    await otherStore.save(resaved)
    expect((await otherStore.get(resaved.id))!.values.retiredKnob).toBe('still here')

    api.cleanup()
    other.cleanup()
  })

  /* The shipped panel, rather than the test registry: a value it knows is read,
     one it does not is carried through untouched. */
  test('the shipped panel loses nothing and invents nothing', () => {
    const patch = createPatch(
      { values: { cutoffFrequency: 3, neverHeardOfIt: 1 } },
      fixedIdentity(),
    )
    const { values, report } = resolvePatch(panelRegistry, patch)

    expect(values.cutoffFrequency).toBe(3)
    expect(report.unknown).toEqual(['neverHeardOfIt'])
    expect(report.invalid).toEqual([])

    const merged = mergeValues(panelRegistry, patch, values)
    expect(merged.cutoffFrequency).toBe(3)
    expect(merged.neverHeardOfIt).toBe(1)
  })
})
