import { describe, expect, test } from 'bun:test'
import { panelRegistry } from '../src/controls/panel.ts'
import { createRegistry } from '../src/controls/registry.ts'
import { isStepKnob, stepBy, stepKnobType, positionIndex } from '../src/controls/stepKnob.ts'
import type { StepKnobDef } from '../src/controls/stepKnob.ts'
import { DETENT_ANGLES } from '../src/components/knob/artwork.ts'
import { waveformGlyphs, waveformOrder } from '../src/components/knob/waveforms.ts'

const def: StepKnobDef = {
  id: 'testRange',
  type: 'stepKnob',
  label: 'Range',
  section: 's',
  positions: [
    { id: 'lo', label: 'LO' },
    { id: 'ft32', label: "32'" },
    { id: 'ft8', label: "8'" },
  ],
  default: 'ft32',
}

describe('stepKnob codec', () => {
  test('accepts a position id', () => {
    expect(stepKnobType.decode('ft8', def)).toEqual({ status: 'ok', value: 'ft8' })
  })

  test('rejects a label rather than quietly accepting it', () => {
    /* The whole point of storing ids: the printed label must never be the value. */
    expect(stepKnobType.decode("8'", def).status).toBe('invalid')
  })

  test('rejects an index rather than quietly accepting it', () => {
    expect(stepKnobType.decode(2, def).status).toBe('invalid')
  })

  test('rejects a position that no longer exists', () => {
    expect(stepKnobType.decode('ft64', def).status).toBe('invalid')
  })

  test('formats as the printed label', () => {
    expect(stepKnobType.format('ft32', def)).toBe("32'")
  })
})

describe('definition validation at registry build', () => {
  const build = (override: Partial<StepKnobDef>) =>
    createRegistry({
      types: [stepKnobType] as never,
      sections: [{ id: 's', label: 'S' }],
      items: [{ ...def, ...override }],
    })

  test('a default that is not one of the positions fails at startup', () => {
    expect(() => build({ default: 'ft16' })).toThrow(/not one of its positions/)
  })

  test('duplicate position ids fail at startup', () => {
    expect(() =>
      build({ positions: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }], default: 'a' }),
    ).toThrow(/duplicate position ids/)
  })

  test('a position id that is unsafe to store fails at startup', () => {
    expect(() =>
      build({ positions: [{ id: "8'", label: "8'" }], default: "8'" }),
    ).toThrow(/not safe to store/)
  })

  test('a valid definition builds', () => {
    expect(() => build({})).not.toThrow()
  })
})

describe('stepping', () => {
  test('moves one position at a time', () => {
    expect(stepBy(def, 'lo', 1)).toBe('ft32')
    expect(stepBy(def, 'ft32', -1)).toBe('lo')
  })

  test('stops at the ends instead of wrapping', () => {
    /* A rotary selector has end stops; wrapping would send a drag past the end
       flying to the opposite extreme. */
    expect(stepBy(def, 'lo', -1)).toBe('lo')
    expect(stepBy(def, 'ft8', 1)).toBe('ft8')
    expect(stepBy(def, 'lo', 99)).toBe('ft8')
  })

  test('an unrecognised current value steps from the default', () => {
    expect(positionIndex(def, 'nonsense')).toBe(1)
  })
})

describe('the two Oscillator-1 knobs', () => {
  const range = panelRegistry.control('osc1Range')!
  const waveform = panelRegistry.control('osc1Waveform')!

  test('are both step knobs', () => {
    expect(isStepKnob(range)).toBe(true)
    expect(isStepKnob(waveform)).toBe(true)
  })

  test('have six positions each, matching the six detents on the artwork', () => {
    expect((range as StepKnobDef).positions).toHaveLength(DETENT_ANGLES.length)
    expect((waveform as StepKnobDef).positions).toHaveLength(DETENT_ANGLES.length)
  })

  test('store ids, never the printed labels', () => {
    const ids = (range as StepKnobDef).positions.map((p) => p.id)
    expect(ids).toEqual(['lo', 'ft32', 'ft16', 'ft8', 'ft4', 'ft2'])
    /* Bare numeric ids would be hoisted and reordered as object keys. */
    expect(ids.every((id) => !/^\d+$/.test(id))).toBe(true)
  })

  test('every waveform position names a glyph that exists', () => {
    const positions = (waveform as StepKnobDef).positions
    expect(positions.map((p) => p.glyph)).toEqual([...waveformOrder])
    for (const position of positions) {
      expect(waveformGlyphs[position.glyph as keyof typeof waveformGlyphs]).toBeDefined()
    }
  })
})

describe('waveform artwork', () => {
  test('there is one glyph per detent, in dial order', () => {
    expect(waveformOrder).toHaveLength(DETENT_ANGLES.length)
    expect(new Set(waveformOrder).size).toBe(waveformOrder.length)
  })

  test('every glyph carries a path and bounds so it can be drawn alone', () => {
    for (const id of waveformOrder) {
      const glyph = waveformGlyphs[id]
      expect(glyph.path.startsWith('M')).toBe(true)
      expect(glyph.box.width).toBeGreaterThan(0)
      expect(glyph.box.height).toBeGreaterThan(0)
    }
  })

  test('the detents are the six measured off the export, 30 degrees apart', () => {
    expect([...DETENT_ANGLES]).toEqual([-75, -45, -15, 15, 45, 75])
  })
})
