import { describe, expect, test } from 'bun:test'
import { panelRegistry } from '../src/controls/panel.ts'
import { createRegistry, defaultValues } from '../src/controls/registry.ts'
import { isDecoration } from '../src/controls/types.ts'
import { rangeDef, testEnumType, testNumberType, testRegistry, volumeDef } from './fixtures.ts'

describe('registry', () => {
  test('a control is either built or an unspecified placeholder, nothing in between', () => {
    expect(panelRegistry.controls.length).toBeGreaterThan(0)
    expect(panelRegistry.controls.every((def) => ['placeholder', 'stepKnob'].includes(def.type)))
      .toBe(true)
  })

  test('placeholders still contribute no invented value', () => {
    const defaults = defaultValues(panelRegistry)
    for (const def of panelRegistry.controls) {
      if (def.type === 'placeholder') expect(defaults[def.id]).toBeNull()
      else expect(defaults[def.id]).not.toBeNull()
    }
  })

  test('panel item ids are unique and safe as JSON keys', () => {
    const ids = panelRegistry.items.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => /^[A-Za-z0-9_-]+$/.test(id))).toBe(true)
  })

  test('looks controls up by id and by section', () => {
    const registry = testRegistry()
    expect(registry.control('testVolume')).toBe(volumeDef)
    expect(registry.control('nope')).toBeUndefined()
    expect(registry.itemsInSection('testSection')).toEqual([volumeDef, rangeDef])
    expect(registry.itemsInSection('missing')).toEqual([])
  })

  test('defaults come from each control type', () => {
    expect(defaultValues(testRegistry())).toEqual({ testVolume: 5, testRange: 'lo' })
  })

  test('every group belongs to the section its items are in', () => {
    for (const group of panelRegistry.groups) {
      expect(panelRegistry.sections.find((s) => s.id === group.section)).toBeDefined()
    }
  })

  test('groups chunk consecutive items without reordering them', () => {
    const runs = panelRegistry.runsInSection('modifiers')
    expect(runs.map((run) => run.group?.id ?? null)).toEqual([
      'filterRouting',
      'filter',
      'filterContour',
      'loudnessContour',
    ])
    expect(runs.flatMap((run) => run.items)).toEqual(panelRegistry.itemsInSection('modifiers'))
  })

  test('rejects duplicate ids', () => {
    expect(() =>
      createRegistry({
        types: [testNumberType] as never,
        sections: [{ id: 'testSection', label: 'Test' }],
        items: [volumeDef, volumeDef],
      }),
    ).toThrow(/Duplicate panel item id/)
  })

  test('rejects a control whose type is not registered', () => {
    expect(() =>
      createRegistry({
        types: [testEnumType] as never,
        sections: [{ id: 'testSection', label: 'Test' }],
        items: [volumeDef],
      }),
    ).toThrow(/unregistered type/)
  })

  test('rejects an item in an unknown section', () => {
    expect(() =>
      createRegistry({
        types: [testNumberType] as never,
        sections: [{ id: 'other', label: 'Other' }],
        items: [volumeDef],
      }),
    ).toThrow(/unknown section/)
  })

  test('rejects an id that would not survive being a JSON key', () => {
    expect(() =>
      createRegistry({
        types: [testNumberType] as never,
        sections: [{ id: 'testSection', label: 'Test' }],
        items: [{ ...volumeDef, id: 'bad id!' }],
      }),
    ).toThrow(/Invalid panel item id/)
  })

  test('rejects an item whose group belongs to another section', () => {
    expect(() =>
      createRegistry({
        types: [testNumberType] as never,
        sections: [
          { id: 'testSection', label: 'Test' },
          { id: 'other', label: 'Other' },
        ],
        groups: [{ id: 'elsewhere', label: 'Elsewhere', section: 'other' }],
        items: [{ ...volumeDef, group: 'elsewhere' }],
      }),
    ).toThrow(/belongs to/)
  })

  test('rejects an item in a group that does not exist', () => {
    expect(() =>
      createRegistry({
        types: [testNumberType] as never,
        sections: [{ id: 'testSection', label: 'Test' }],
        items: [{ ...volumeDef, group: 'nope' }],
      }),
    ).toThrow(/unknown group/)
  })
})

describe('decorations', () => {
  const decorated = () =>
    createRegistry({
      types: [testNumberType] as never,
      sections: [{ id: 'testSection', label: 'Test' }],
      items: [
        volumeDef,
        { kind: 'decoration', id: 'lamp', label: 'Lamp', section: 'testSection', shape: 'lamp' },
      ],
    })

  test('are drawn but are not controls', () => {
    const registry = decorated()
    expect(registry.items).toHaveLength(2)
    expect(registry.controlIds).toEqual(['testVolume'])
    expect(registry.decorations.map((d) => d.id)).toEqual(['lamp'])
    expect(registry.itemsInSection('testSection')).toHaveLength(2)
  })

  test('never contribute a default value', () => {
    expect(defaultValues(decorated())).toEqual({ testVolume: 5 })
  })

  test('are not reachable as controls', () => {
    expect(decorated().control('lamp')).toBeUndefined()
  })

  test('share the id space with controls, so one can become the other safely', () => {
    expect(() =>
      createRegistry({
        types: [testNumberType] as never,
        sections: [{ id: 'testSection', label: 'Test' }],
        items: [
          volumeDef,
          {
            kind: 'decoration',
            id: 'testVolume',
            label: 'Clash',
            section: 'testSection',
            shape: 'lamp',
          },
        ],
      }),
    ).toThrow(/Duplicate panel item id/)
  })

  test('need no control type registered', () => {
    expect(() =>
      createRegistry({
        types: [],
        sections: [{ id: 'testSection', label: 'Test' }],
        items: [
          { kind: 'decoration', id: 'lamp', label: 'Lamp', section: 'testSection', shape: 'lamp' },
        ],
      }),
    ).not.toThrow()
  })
})

describe('the shipped panel', () => {
  test('Output and Power are drawn but hold no values', () => {
    for (const sectionId of ['output', 'power']) {
      const items = panelRegistry.itemsInSection(sectionId)
      expect(items.length).toBeGreaterThan(0)
      expect(items.every(isDecoration)).toBe(true)
    }
    const ids = panelRegistry.controlIds
    expect(ids).not.toContain('mainVolume')
    expect(ids).not.toContain('power')
    expect(ids).not.toContain('a440')
  })

  test('the indicators and the socket hold no values', () => {
    for (const id of ['overloadLamp', 'powerLamp', 'phonesJack']) {
      expect(panelRegistry.items.find((item) => item.id === id)).toBeDefined()
      expect(panelRegistry.controlIds).not.toContain(id)
    }
  })

  test('Oscillator-1 has a range and a waveform but no frequency knob', () => {
    const ids = panelRegistry.controlIds
    expect(ids).toContain('osc1Range')
    expect(ids).toContain('osc1Waveform')
    expect(ids).not.toContain('osc1Frequency')
    expect(ids).toContain('osc2Frequency')
    expect(ids).toContain('osc3Frequency')
  })

  test('Oscillator Modulation sits in the Oscillator Bank', () => {
    expect(panelRegistry.control('oscillatorModulation')?.section).toBe('oscillatorBank')
  })
})
