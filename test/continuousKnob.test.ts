import { describe, expect, test } from 'bun:test'
import {
  continuousKnobType,
  decimalsFor,
  isContinuousKnob,
  quantise,
  scaleMarks,
  type ContinuousKnobDef,
} from '@controls/continuousKnob.ts'
import { panelRegistry } from '@controls/panel.ts'
import { createRegistry } from '@controls/registry.ts'

const volume: ContinuousKnobDef = {
  id: 'vol',
  type: 'continuousKnob',
  label: 'Volume',
  section: 's',
  min: 0,
  max: 10,
  default: 0,
  step: 0.1,
  scale: { tickStep: 1, labelStep: 2 },
}

describe('values are stored in the control own printed units', () => {
  test('a number in range passes through untouched', () => {
    expect(continuousKnobType.decode(6.4, volume)).toEqual({ status: 'ok', value: 6.4 })
  })

  test('out of range clamps rather than failing', () => {
    /* The right failure for a range that later narrows: a patch saved at maximum
       stays at maximum instead of jumping to the middle. */
    expect(continuousKnobType.decode(99, volume)).toEqual({
      status: 'coerced',
      value: 10,
      reason: 'above maximum 10',
    })
    expect(continuousKnobType.decode(-5, volume).status).toBe('coerced')
  })

  test('a non-number is invalid, not coerced', () => {
    expect(continuousKnobType.decode('6.4', volume).status).toBe('invalid')
    expect(continuousKnobType.decode(null, volume).status).toBe('invalid')
    expect(continuousKnobType.decode(Number.NaN, volume).status).toBe('invalid')
    expect(continuousKnobType.decode(Number.POSITIVE_INFINITY, volume).status).toBe('invalid')
  })
})

describe('quantise', () => {
  test('snaps to the step and clamps to the range', () => {
    expect(quantise(volume, 6.44)).toBe(6.4)
    expect(quantise(volume, 6.46)).toBe(6.5)
    expect(quantise(volume, -3)).toBe(0)
    expect(quantise(volume, 40)).toBe(10)
  })

  test('does not accumulate binary drift', () => {
    /* Adding 0.1 thirty times gives 3.0000000000000004 without rounding. */
    let value = 0
    for (let i = 0; i < 30; i++) value = quantise(volume, value + 0.1)
    expect(value).toBe(3)
  })

  test('a half-unit step lands only on halves', () => {
    const tune = { ...volume, min: -2.5, max: 2.5, step: 0.5 }
    expect(quantise(tune, 0.3)).toBe(0.5)
    expect(quantise(tune, -2.4)).toBe(-2.5)
  })
})

describe('decimalsFor', () => {
  test('follows the step when not stated', () => {
    expect(decimalsFor(volume)).toBe(1)
    expect(decimalsFor({ ...volume, step: 1 })).toBe(0)
    expect(decimalsFor({ ...volume, step: 0.05 })).toBe(2)
  })

  test('an explicit value wins', () => {
    expect(decimalsFor({ ...volume, step: 0.1, decimals: 0 })).toBe(0)
  })
})

describe('the printed scale is not the range', () => {
  test('a tick marks the travel past the last numeral, without a label', () => {
    /* Otherwise a knob that reaches 2.5 while printing to 2 looks like it stops
       at 2, and the extra travel reads as a bug. */
    const tune = panelRegistry.control('tune') as ContinuousKnobDef
    expect([tune.min, tune.max]).toEqual([-2.5, 2.5])
    const marks = scaleMarks(tune)
    expect(marks[0]).toEqual({ value: -2.5, labelled: false })
    expect(marks.at(-1)).toEqual({ value: 2.5, labelled: false })
    expect(marks.filter((m) => m.labelled).map((m) => m.value)).toEqual([-2, -1, 0, 1, 2])
  })

  test('a knob whose scale covers its whole range gains no extra ticks', () => {
    expect(scaleMarks(volume)[0]!.value).toBe(0)
    expect(scaleMarks(volume).at(-1)!.value).toBe(10)
    expect(scaleMarks(volume)).toHaveLength(11)
  })

  test('a 0-10 knob ticks every unit and prints every other', () => {
    const marks = scaleMarks(volume)
    expect(marks).toHaveLength(11)
    expect(marks.filter((m) => m.labelled).map((m) => m.value)).toEqual([0, 2, 4, 6, 8, 10])
  })

  test('the oscillator frequency knobs tick to 8 while the numerals stop at 7', () => {
    for (const id of ['osc2Frequency', 'osc3Frequency']) {
      const def = panelRegistry.control(id) as ContinuousKnobDef
      const marks = scaleMarks(def)
      expect([def.min, def.max]).toEqual([-8, 8])
      expect(marks.at(-1)).toEqual({ value: 8, labelled: false })
      expect(marks.filter((m) => m.labelled).at(-1)!.value).toBe(7)
    }
  })

  test('cutoff ticks to 5 while the numerals stop at 4', () => {
    const def = panelRegistry.control('cutoffFrequency') as ContinuousKnobDef
    const marks = scaleMarks(def)
    expect([def.min, def.max]).toEqual([-5, 5])
    expect(marks.at(-1)).toEqual({ value: 5, labelled: false })
    expect(marks.filter((m) => m.labelled).at(-1)!.value).toBe(4)
  })
})

describe('definition validation', () => {
  const build = (override: Partial<ContinuousKnobDef>) =>
    createRegistry({
      types: [continuousKnobType] as never,
      sections: [{ id: 's', label: 'S' }],
      items: [{ ...volume, ...override }],
    })

  test('a default outside the range fails at startup', () => {
    expect(() => build({ default: 11 })).toThrow(/outside/)
  })

  test('min not below max fails at startup', () => {
    expect(() => build({ min: 10, max: 10 })).toThrow(/not below/)
  })

  test('a non-positive step fails at startup', () => {
    expect(() => build({ step: 0 })).toThrow(/must be positive/)
  })

  test('a printed scale running outside the range fails at startup', () => {
    expect(() => build({ scale: { from: -1, to: 20, tickStep: 1, labelStep: 2 } })).toThrow(
      /runs outside the range/,
    )
  })

  test('a valid definition builds', () => {
    expect(() => build({})).not.toThrow()
  })
})

describe('the shipped continuous knobs', () => {
  const knobs = panelRegistry.controls.filter(isContinuousKnob)

  test('there are eighteen of them, the time knobs being their own type', () => {
    expect(knobs).toHaveLength(18)
    for (const id of [
      'filterAttackTime',
      'filterDecayTime',
      'loudnessAttackTime',
      'loudnessDecayTime',
    ]) {
      expect(panelRegistry.control(id)!.type).toBe('timeKnob')
    }
  })

  test('every default sits inside its own range', () => {
    for (const def of knobs) {
      expect(def.default).toBeGreaterThanOrEqual(def.min)
      expect(def.default).toBeLessThanOrEqual(def.max)
    }
  })

  /* Symmetry is about the travel, not about where the knob is left: Cutoff is
     symmetric and an init patch has it wide open. */
  test('every symmetric knob travels as far one way as the other', () => {
    for (const def of knobs.filter((k) => k.min < 0)) {
      expect(def.min).toBe(-def.max)
    }
  })
})
