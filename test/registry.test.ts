import { describe, expect, test } from 'bun:test'
import { createRegistry, defaultValues } from '../src/controls/registry.ts'
import { panelRegistry } from '../src/controls/panel.ts'
import { rangeDef, testEnumType, testNumberType, testRegistry, volumeDef } from './fixtures.ts'

describe('registry', () => {
  test('the shipped panel has no controls defined yet', () => {
    expect(panelRegistry.controls).toHaveLength(0)
    expect(panelRegistry.sections).toHaveLength(0)
    expect(defaultValues(panelRegistry)).toEqual({})
  })

  test('looks controls up by id and by section', () => {
    const registry = testRegistry()
    expect(registry.control('testVolume')).toBe(volumeDef)
    expect(registry.control('nope')).toBeUndefined()
    expect(registry.controlsInSection('testSection')).toEqual([volumeDef, rangeDef])
    expect(registry.controlsInSection('missing')).toEqual([])
  })

  test('defaults come from each control type', () => {
    expect(defaultValues(testRegistry())).toEqual({ testVolume: 5, testRange: 'lo' })
  })

  test('rejects duplicate control ids', () => {
    expect(() =>
      createRegistry({
        types: [testNumberType] as never,
        sections: [{ id: 'testSection', label: 'Test' }],
        controls: [volumeDef, volumeDef],
      }),
    ).toThrow(/Duplicate control id/)
  })

  test('rejects a control whose type is not registered', () => {
    expect(() =>
      createRegistry({
        types: [testEnumType] as never,
        sections: [{ id: 'testSection', label: 'Test' }],
        controls: [volumeDef],
      }),
    ).toThrow(/unregistered type/)
  })

  test('rejects a control in an unknown section', () => {
    expect(() =>
      createRegistry({
        types: [testNumberType] as never,
        sections: [{ id: 'other', label: 'Other' }],
        controls: [volumeDef],
      }),
    ).toThrow(/unknown section/)
  })

  test('rejects an id that would not survive being a JSON key', () => {
    expect(() =>
      createRegistry({
        types: [testNumberType] as never,
        sections: [{ id: 'testSection', label: 'Test' }],
        controls: [{ ...volumeDef, id: 'bad id!' }],
      }),
    ).toThrow(/Invalid control id/)
  })
})
