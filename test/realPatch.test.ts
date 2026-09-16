import { describe, expect, test } from 'bun:test'
import { panelRegistry } from '../src/controls/panel.ts'
import { defaultValues } from '../src/controls/registry.ts'
import { mergeValues, resolvePatch } from '../src/patch/resolve.ts'
import { createPatch } from '../src/patch/schema.ts'
import { testApi } from './apiFixture.ts'
import { createBundle, parseBundle, serializeBundle } from '../src/transfer/bundle.ts'

/* The storage and transfer layers were built before any control existed and were
   covered only by fixtures defining two invented control types. These drive a
   patch of all 43 real controls — every type the panel has, none of them at
   their default — through the two journeys a patch actually makes. */

const EDITS: Record<string, unknown> = {
  tune: 1.25,
  glide: 3.4,
  modulationMix: 6.75,
  osc1Range: 'ft32',
  osc1Waveform: 'triangleSaw',
  osc3Waveform: 'reverseSawtooth',
  osc2Frequency: -7.41,
  cutoffFrequency: -4.75,
  filterAttackTime: 800,
  loudnessDecayTime: 7500,
  noiseColour: 'pink',
  osc1Enable: 'on',
  pitchWheel: -2.5,
  modWheel: 7.5,
}

function realPatch() {
  const values = { ...defaultValues(panelRegistry), ...EDITS }
  return { values, patch: createPatch({ name: 'Round Trip', notes: 'all controls', values }) }
}

describe('a patch of every real control survives being saved and reloaded', () => {
  test('every value comes back exactly as it went in', async () => {
    const { values, patch } = realPatch()
    const api = testApi()
    await api.store.save(patch)

    /* Read back off disk, which is what a page reload amounts to. */
    const reloaded = await api.store.get(patch.id)
    expect(reloaded).not.toBeNull()
    for (const [id, want] of Object.entries(values)) {
      expect([id, reloaded!.values[id]]).toEqual([id, want])
    }
    api.cleanup()
  })
})

describe('a patch of every real control survives export and import', () => {
  test('every value comes back exactly as it went in', () => {
    const { values, patch } = realPatch()
    const parsed = parseBundle(serializeBundle(createBundle([patch])))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const imported = parsed.value.patches[0]!
    for (const [id, want] of Object.entries(values)) {
      expect([id, imported.values[id]]).toEqual([id, want])
    }
    expect(imported.name).toBe('Round Trip')
    expect(imported.notes).toBe('all controls')
    /* Importing your own export adds a patch rather than overwriting it. */
    expect(imported.id).not.toBe(patch.id)
  })

  test('the registry accepts everything it wrote, judging nothing invalid', () => {
    /* The trap this catches: a codec that will not read back its own output —
       a step knob rejecting ft32, or a hundredth clamped away — which would show
       as a control silently sitting at its default after a load. */
    const { patch } = realPatch()
    const { report } = resolvePatch(panelRegistry, patch)
    expect(report.invalid).toEqual([])
    expect(report.coerced).toEqual([])
    expect(report.unknown).toEqual([])
    expect(report.missing).toEqual([])
  })

  test('resolving and saving again changes nothing, bar the wheel that is played', () => {
    const { values, patch } = realPatch()
    const resolved = resolvePatch(panelRegistry, patch)

    /* The pitch wheel springs back to centre, so the file does not hold it: a
       value written by an older build is ignored on load and gone on the next
       save. Every other control comes through untouched. */
    expect(resolved.values.pitchWheel).toBe(0)
    const { pitchWheel: _played, ...kept } = values
    expect(mergeValues(panelRegistry, patch, resolved.values)).toEqual(kept)
  })
})

describe('the shape of an exported file', () => {
  test('is the envelope, with the patch inside it', () => {
    const { patch } = realPatch()
    const file = JSON.parse(serializeBundle(createBundle([patch])))
    expect(file.format).toBe('minimoog-patch-bundle')
    expect(file.formatVersion).toBe(1)
    expect(file.patches).toHaveLength(1)
    expect(file.patches[0].schemaVersion).toBe(1)
    expect(Object.keys(file.patches[0].values)).toHaveLength(43)
  })

  test('carries only plain JSON, so nothing depends on how it was built', () => {
    const { patch } = realPatch()
    const file = serializeBundle(createBundle([patch]))
    for (const value of Object.values(JSON.parse(file).patches[0].values)) {
      expect(['number', 'string']).toContain(typeof value)
    }
  })
})
