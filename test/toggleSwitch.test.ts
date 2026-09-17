import { describe, expect, test } from 'bun:test'
import { panelRegistry } from '@controls/panel.ts'
import { createRegistry } from '@controls/registry.ts'
import { isToggleSwitch, toggleSwitchType, type ToggleSwitchDef } from '@controls/toggleSwitch.ts'
import { stepBy } from '@controls/discrete.ts'

const source: ToggleSwitchDef = {
  id: 'modSource',
  type: 'toggleSwitch',
  label: 'Source',
  section: 's',
  positions: [
    { id: 'osc3', label: 'Osc. 3' },
    { id: 'filterEg', label: 'Filter EG' },
  ],
  default: 'osc3',
}

describe('a switch is not a boolean', () => {
  /* Several of these choose between two named things rather than turning one on,
     so true/false would need a label map at every call site and a type change the
     day one gains a third position. */
  test('stores a position id, not true or false', () => {
    expect(toggleSwitchType.decode('filterEg', source)).toEqual({
      status: 'ok',
      value: 'filterEg',
    })
    expect(toggleSwitchType.decode(true, source).status).toBe('invalid')
    expect(toggleSwitchType.decode(false, source).status).toBe('invalid')
  })

  test('rejects the printed label', () => {
    expect(toggleSwitchType.decode('Filter EG', source).status).toBe('invalid')
  })

  test('formats as the printed label', () => {
    expect(toggleSwitchType.format('filterEg', source)).toBe('Filter EG')
  })

  test('an on/off switch still stores names, not booleans', () => {
    const onOff = panelRegistry.control('osc1Enable') as ToggleSwitchDef
    expect(onOff.positions.map((p) => p.id)).toEqual(['off', 'on'])
    expect(toggleSwitchType.decode(true, onOff).status).toBe('invalid')
  })
})

describe('definition validation', () => {
  const build = (override: Partial<ToggleSwitchDef>) =>
    createRegistry({
      types: [toggleSwitchType] as never,
      sections: [{ id: 's', label: 'S' }],
      items: [{ ...source, ...override }],
    })

  test('a default outside its own positions fails at startup', () => {
    expect(() => build({ default: 'nope' })).toThrow(/not one of its positions/)
  })

  test('duplicate position ids fail at startup', () => {
    expect(() =>
      build({
        positions: [
          { id: 'x', label: 'A' },
          { id: 'x', label: 'B' },
        ],
        default: 'x',
      }),
    ).toThrow(/duplicate position ids/)
  })

  test('a valid definition builds', () => {
    expect(() => build({})).not.toThrow()
  })
})

describe('the shipped switches', () => {
  const switches = panelRegistry.controls.filter(isToggleSwitch)

  test('every one has exactly two positions', () => {
    expect(switches.length).toBeGreaterThan(0)
    for (const def of switches) expect(def.positions).toHaveLength(2)
  })

  test('every default is one of that switch own positions', () => {
    for (const def of switches) {
      expect(def.positions.map((p) => p.id)).toContain(def.default)
    }
  })

  test('toggling lands on the other position and back', () => {
    for (const def of switches) {
      const other = stepBy(def, def.positions[0].id, 1)
      expect(other).toBe(def.positions[1].id)
      expect(stepBy(def, other, -1)).toBe(def.positions[0].id)
    }
  })

  test('noise colour is the vertical white/pink switch', () => {
    const noise = panelRegistry.control('noiseColour') as ToggleSwitchDef
    expect(noise.orientation).toBe('vertical')
    expect(noise.positions.map((p) => p.id)).toEqual(['white', 'pink'])
    expect(noise.positions.map((p) => p.label)).toEqual(['White', 'Pink'])
  })

  test('on/off switches print a legend on one side only', () => {
    const onOff = switches.filter((def) => def.positions.some((p) => p.id === 'on'))
    expect(onOff.length).toBeGreaterThan(0)
    for (const def of onOff) {
      expect(def.positions[0].label).toBe('')
      expect(def.positions[1].label).toBe('ON')
    }
  })

  test('a switch choosing between two names labels both ends', () => {
    for (const id of ['modulationSourceA', 'modulationSourceB', 'osc3Control', 'noiseColour']) {
      const def = panelRegistry.control(id) as ToggleSwitchDef
      expect(def.positions[0].label).not.toBe('')
      expect(def.positions[1].label).not.toBe('')
    }
  })
})
