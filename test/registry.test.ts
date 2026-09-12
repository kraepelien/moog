import { describe, expect, test } from 'bun:test'
import { createRegistry, defaultValues } from '../src/controls/registry.ts'
import { panelRegistry } from '../src/controls/panel.ts'
import { rangeDef, testEnumType, testNumberType, testRegistry, volumeDef } from './fixtures.ts'

describe('registry', () => {
  test('every control on the shipped panel is still an unspecified placeholder', () => {
    expect(panelRegistry.controls.length).toBeGreaterThan(0)
    expect(panelRegistry.controls.every((def) => def.type === 'placeholder')).toBe(true)
    /* A placeholder must not invent a value, or reviewing the layout would start
       writing made-up settings into saved patches. */
    expect(Object.values(defaultValues(panelRegistry)).every((v) => v === null)).toBe(true)
  })

  test('panel control ids are unique and safe as JSON keys', () => {
    const ids = panelRegistry.controlIds
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => /^[A-Za-z0-9_-]+$/.test(id))).toBe(true)
  })

  test('every group belongs to the section its controls are in', () => {
    for (const group of panelRegistry.groups) {
      const section = panelRegistry.sections.find((s) => s.id === group.section)
      expect(section).toBeDefined()
    }
  })

  test('groups chunk consecutive controls without reordering them', () => {
    const runs = panelRegistry.runsInSection('modifiers')
    expect(runs.map((run) => run.group?.id ?? null)).toEqual([
      'filterRouting',
      'filter',
      'filterContour',
      'loudnessContour',
    ])
    const flattened = runs.flatMap((run) => run.controls)
    expect(flattened).toEqual(panelRegistry.controlsInSection('modifiers'))
  })

  test('rejects a control whose group belongs to another section', () => {
    expect(() =>
      createRegistry({
        types: [testNumberType] as never,
        sections: [
          { id: 'testSection', label: 'Test' },
          { id: 'other', label: 'Other' },
        ],
        groups: [{ id: 'elsewhere', label: 'Elsewhere', section: 'other' }],
        controls: [{ ...volumeDef, group: 'elsewhere' }],
      }),
    ).toThrow(/belongs to/)
  })

  test('rejects a control in a group that does not exist', () => {
    expect(() =>
      createRegistry({
        types: [testNumberType] as never,
        sections: [{ id: 'testSection', label: 'Test' }],
        controls: [{ ...volumeDef, group: 'nope' }],
      }),
    ).toThrow(/unknown group/)
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
