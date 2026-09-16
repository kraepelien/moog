import { describe, expect, test } from 'bun:test'
import { mergeValues, reportHasWarnings, resolvePatch } from '../src/patch/resolve.ts'
import { createPatch } from '../src/patch/schema.ts'
import { fixedIdentity, testRegistry } from './fixtures.ts'

const registry = testRegistry()

function patchWith(values: Record<string, unknown>) {
  return createPatch({ name: 'test', values }, fixedIdentity())
}

describe('resolvePatch', () => {
  test('fills a control the patch predates from its default, and says so quietly', () => {
    const { values, report } = resolvePatch(registry, patchWith({ testRange: 'hi' }))
    expect(values).toEqual({ testVolume: 5, testRange: 'hi' })
    expect(report.missing).toEqual(['testVolume'])
    expect(reportHasWarnings(report)).toBe(false)
  })

  test('keeps unknown ids out of the resolved values but reports them', () => {
    const { values, report } = resolvePatch(registry, patchWith({ fromTheFuture: 42 }))
    expect(values).not.toHaveProperty('fromTheFuture')
    expect(report.unknown).toEqual(['fromTheFuture'])
    expect(reportHasWarnings(report)).toBe(true)
  })

  test('clamps an out-of-range value rather than discarding it', () => {
    const { values, report } = resolvePatch(registry, patchWith({ testVolume: 99 }))
    expect(values.testVolume).toBe(10)
    expect(report.coerced).toEqual([{ id: 'testVolume', reason: 'above maximum 10' }])
    expect(report.invalid).toEqual([])
  })

  test('falls back to the default when a value cannot be salvaged', () => {
    const { values, report } = resolvePatch(registry, patchWith({ testVolume: 'loud' }))
    expect(values.testVolume).toBe(5)
    expect(report.invalid).toEqual([{ id: 'testVolume', reason: 'not a finite number' }])
  })

  test('a discrete value not among the positions resets rather than clamping', () => {
    const { values, report } = resolvePatch(registry, patchWith({ testRange: 'sideways' }))
    expect(values.testRange).toBe('lo')
    expect(report.invalid[0]?.reason).toMatch(/not a position/)
  })
})

describe('mergeValues', () => {
  test('editing a known control leaves an unknown one intact', () => {
    const patch = patchWith({ testVolume: 3, fromTheFuture: { keep: true } })
    const merged = mergeValues(registry, patch, { testVolume: 7 })
    expect(merged).toEqual({ testVolume: 7, fromTheFuture: { keep: true } })
  })

  test('a patch round-trips through a build that does not know one of its controls', () => {
    const original = patchWith({ testVolume: 3, laterKnob: 'preserved' })
    const { values } = resolvePatch(registry, original)
    const saved = { ...original, values: mergeValues(registry, original, values) }
    expect(saved.values.laterKnob).toBe('preserved')
  })
})
