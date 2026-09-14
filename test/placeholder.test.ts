import { describe, expect, test } from 'bun:test'
import { panelRegistry } from '../src/controls/panel.ts'
import { placeholderType } from '../src/controls/placeholder.ts'
import { mergeValues, resolvePatch } from '../src/patch/resolve.ts'
import { createPatch } from '../src/patch/schema.ts'
import { fixedIdentity } from './fixtures.ts'

describe('placeholder control type', () => {
  test('has no value of its own', () => {
    expect(placeholderType.defaultValue({} as never)).toBeNull()
  })

  test('accepts any stored value and hands it straight back', () => {
    for (const raw of [7, 'saw', null, { a: 1 }, false]) {
      expect(placeholderType.decode(raw, {} as never)).toEqual({ status: 'ok', value: raw })
    }
  })
})

describe('reviewing the layout cannot damage a patch', () => {
  /* The case that matters: a build where a control is properly defined saves a
     real value, then this build — where it is still a placeholder — loads, is
     looked at, and saves again. The value must come back out unchanged. */
  test('a real value survives a load and save through a placeholder', () => {
    const fromLaterBuild = createPatch(
      { name: 'Real', values: { cutoffFrequency: -1.5, osc1Range: '8', lfoRate: 4 } },
      fixedIdentity(),
    )

    const { values, report } = resolvePatch(panelRegistry, fromLaterBuild)

    expect(values.cutoffFrequency).toBe(-1.5)
    expect(values.osc1Range).toBe('8')
    expect(values.lfoRate).toBe(4)
    expect(report.invalid).toEqual([])
    expect(report.coerced).toEqual([])

    const resaved = { ...fromLaterBuild, values: mergeValues(fromLaterBuild, values) }
    expect(resaved.values.cutoffFrequency).toBe(-1.5)
    expect(resaved.values.osc1Range).toBe('8')
  })

  test('a patch with no values gains nulls, not invented settings', () => {
    const empty = createPatch({ name: 'Empty' }, fixedIdentity())
    const { values, report } = resolvePatch(panelRegistry, empty)

    expect(report.missing).toEqual(panelRegistry.controlIds)
    expect(Object.values(values).every((value) => value === null)).toBe(true)
  })
})
