import { describe, expect, test } from 'bun:test'
import { panelRegistry } from '../src/controls/panel.ts'
import { createRegistry } from '../src/controls/registry.ts'
import {
  formatMs,
  fractionForMs,
  isTimeKnob,
  maxMs,
  minMs,
  msAtFraction,
  quantiseMs,
  scaleLabel,
  timeKnobType,
  type TimeKnobDef,
} from '../src/controls/timeKnob.ts'

const attack = panelRegistry.control('filterAttackTime') as TimeKnobDef

describe('the non-linear scale', () => {
  /* The claim the whole design rests on: the marks are evenly spaced around the
     dial while their values are not, which is what puts 800 ms at half travel. */
  test('800 ms sits at exactly half travel', () => {
    expect(fractionForMs(attack, 800)).toBeCloseTo(0.5, 10)
    expect(msAtFraction(attack, 0.5)).toBe(800)
  })

  test('every mark sits at its own even fraction of the sweep', () => {
    const segments = attack.anchors.length - 1
    attack.anchors.forEach((ms, index) => {
      expect(fractionForMs(attack, ms)).toBeCloseTo(index / segments, 10)
      expect(msAtFraction(attack, index / segments)).toBeCloseTo(ms, 6)
    })
  })

  test('the ends are 0 ms and 30 s', () => {
    expect(minMs(attack)).toBe(0)
    expect(maxMs(attack)).toBe(30_000)
  })

  test('position to value and back is stable', () => {
    for (const fraction of [0, 0.13, 0.37, 0.5, 0.62, 0.88, 1]) {
      expect(fractionForMs(attack, msAtFraction(attack, fraction))).toBeCloseTo(fraction, 8)
    }
  })

  test('interpolates inside a segment rather than jumping', () => {
    /* Between 400 ms and 600 ms, a quarter of the way along. */
    const segments = attack.anchors.length - 1
    const quarter = (4 + 0.25) / segments
    expect(msAtFraction(attack, quarter)).toBeCloseTo(450, 6)
  })

  test('equal turns of the knob give very unequal changes in time', () => {
    /* The reason a fixed step in milliseconds cannot work: one step is worth
       under a second low down and thousands of milliseconds at the top. */
    const low = msAtFraction(attack, 0.1) - msAtFraction(attack, 0.0)
    const high = msAtFraction(attack, 1.0) - msAtFraction(attack, 0.9)
    expect(high).toBeGreaterThan(low * 100)
  })
})

describe('quantiseMs', () => {
  test('clamps outside the ends', () => {
    expect(quantiseMs(attack, -500)).toBe(0)
    expect(quantiseMs(attack, 99_999)).toBe(30_000)
  })

  test('snaps onto a mark when it lands near one', () => {
    expect(quantiseMs(attack, 799)).toBe(800)
    expect(quantiseMs(attack, 1_010)).toBe(1_000)
  })

  test('keeps a value that is genuinely between marks', () => {
    const between = msAtFraction(attack, (4 + 0.5) / (attack.anchors.length - 1))
    expect(quantiseMs(attack, between)).toBe(500)
  })

  test('rounds to whole milliseconds', () => {
    expect(Number.isInteger(quantiseMs(attack, 137.4))).toBe(true)
  })
})

describe('display', () => {
  test('switches unit at a second', () => {
    expect(formatMs(0)).toBe('0 ms')
    expect(formatMs(800)).toBe('800 ms')
    expect(formatMs(1_000)).toBe('1 s')
    expect(formatMs(7_500)).toBe('7.5 s')
    expect(formatMs(30_000)).toBe('30 s')
  })

  test('the dial prints bare numbers, the unit named once per end', () => {
    expect(scaleLabel(200)).toBe('200')
    expect(scaleLabel(7_500)).toBe('7.5')
  })

  test('the marks the panel prints are the six on the sheet', () => {
    const printed = attack.anchors.filter((_, index) => index % 2 === 1).map(scaleLabel)
    expect(printed).toEqual(['10', '200', '600', '1', '5', '10'])
  })
})

describe('codec', () => {
  test('stores milliseconds, clamping out of range', () => {
    expect(timeKnobType.decode(450, attack)).toEqual({ status: 'ok', value: 450 })
    expect(timeKnobType.decode(-1, attack).status).toBe('coerced')
    expect(timeKnobType.decode(40_000, attack).status).toBe('coerced')
  })

  test('rejects anything that is not a finite number', () => {
    expect(timeKnobType.decode('800ms', attack).status).toBe('invalid')
    expect(timeKnobType.decode(Number.NaN, attack).status).toBe('invalid')
  })
})

describe('definition validation', () => {
  const build = (override: Partial<TimeKnobDef>) =>
    createRegistry({
      types: [timeKnobType] as never,
      sections: [{ id: 's', label: 'S' }],
      items: [{ ...attack, section: 's', group: undefined, ...override }],
    })

  test('marks that do not ascend fail at startup', () => {
    expect(() => build({ anchors: [0, 500, 200], default: 0 })).toThrow(/must ascend/)
  })

  test('a default outside the marks fails at startup', () => {
    expect(() => build({ default: 99_999 })).toThrow(/outside/)
  })

  test('fewer than two marks fails at startup', () => {
    expect(() => build({ anchors: [0], default: 0 })).toThrow(/at least two/)
  })
})

describe('the four shipped time knobs', () => {
  const knobs = panelRegistry.controls.filter(isTimeKnob)

  test('are attack and decay for both contours', () => {
    expect(knobs.map((k) => k.id).sort()).toEqual([
      'filterAttackTime',
      'filterDecayTime',
      'loudnessAttackTime',
      'loudnessDecayTime',
    ])
  })

  test('each carries its own table, so attack and decay can diverge later', () => {
    for (const knob of knobs) expect(knob.anchors).toHaveLength(13)
  })

  test('nothing on the panel is still a placeholder', () => {
    expect(panelRegistry.controls.filter((def) => def.type === 'placeholder')).toEqual([])
  })
})
