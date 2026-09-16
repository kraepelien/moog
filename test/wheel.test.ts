import { describe, expect, test } from 'bun:test'
import { panelRegistry } from '../src/controls/panel.ts'
import { createRegistry } from '../src/controls/registry.ts'
import {
  isSprung,
  isWheel,
  quantiseWheel,
  wheelDecimals,
  wheelFraction,
  wheelType,
  type WheelDef,
} from '../src/controls/wheel.ts'
import {
  FACE,
  MARKER_BOTTOM,
  MARKER_TOP,
  RIB_BASE,
  RIB_HEIGHT,
  RIB_PITCH,
  markerY,
  ribTops,
  surfaceShift,
} from '../src/components/wheel/wheelArtwork.ts'

const pitch = panelRegistry.control('pitchWheel') as WheelDef
const mod = panelRegistry.control('modWheel') as WheelDef

describe('the two wheels', () => {
  test('pitch is sprung and centred, mod is not', () => {
    expect(isSprung(pitch)).toBe(true)
    expect(pitch.springsTo).toBe(0)
    expect(pitch.min).toBe(-pitch.max)
    expect(isSprung(mod)).toBe(false)
  })

  test('mod runs from nothing upward', () => {
    expect(mod.min).toBe(0)
    expect(mod.max).toBe(10)
    expect(mod.default).toBe(0)
  })

  test('both store numbers, clamping out of range', () => {
    expect(wheelType.decode(3, mod)).toEqual({ status: 'ok', value: 3 })
    expect(wheelType.decode(-1, mod).status).toBe('coerced')
    expect(wheelType.decode(99, pitch).status).toBe('coerced')
    expect(wheelType.decode('3', mod).status).toBe('invalid')
  })
})

describe('travel', () => {
  test('the bottom of the range sits at the bottom of the wheel', () => {
    expect(wheelFraction(mod, mod.min)).toBe(0)
    expect(markerY(0)).toBe(MARKER_BOTTOM)
  })

  test('the top of the range sits at the top of the wheel', () => {
    expect(wheelFraction(mod, mod.max)).toBe(1)
    expect(markerY(1)).toBe(MARKER_TOP)
  })

  test('a centred wheel puts its rest position halfway up', () => {
    expect(wheelFraction(pitch, 0)).toBeCloseTo(0.5, 10)
    expect(markerY(0.5)).toBeCloseTo((MARKER_BOTTOM + MARKER_TOP) / 2, 10)
  })

  test('the travel is symmetrical about the face', () => {
    /* The export draws the marker near the bottom; the top end is its mirror. */
    expect(MARKER_BOTTOM).toBe(187)
    expect(MARKER_BOTTOM - MARKER_TOP).toBeGreaterThan(0)
  })
})

describe('quantiseWheel', () => {
  test('keeps hundredths and clamps to the range', () => {
    expect(quantiseWheel(mod, 3.44)).toBe(3.44)
    expect(quantiseWheel(mod, 3.446)).toBe(3.45)
    expect(quantiseWheel(mod, -2)).toBe(0)
    expect(quantiseWheel(pitch, 99)).toBe(5)
  })

  /* Stored to a hundredth, shown to a tenth: dragging keeps the precision it was
     given while the panel stays readable. */
  test('stores finer than it displays', () => {
    expect(mod.step).toBe(0.01)
    expect(wheelDecimals(mod)).toBe(1)
    expect(quantiseWheel(mod, 3.44).toFixed(wheelDecimals(mod))).toBe('3.4')
  })

  test('does not accumulate binary drift', () => {
    let value = 0
    for (let i = 0; i < 30; i++) value = quantiseWheel(mod, value + 0.1)
    expect(value).toBe(3)
  })
})

describe('definition validation', () => {
  const build = (override: Partial<WheelDef>) =>
    createRegistry({
      types: [wheelType] as never,
      sections: [{ id: 's', label: 'S' }],
      items: [{ ...mod, section: 's', group: undefined, ...override }],
    })

  test('a rest position outside the range fails at startup', () => {
    expect(() => build({ springsTo: 50 })).toThrow(/springsTo/)
  })

  test('a default outside the range fails at startup', () => {
    expect(() => build({ default: 50 })).toThrow(/outside/)
  })

  test('a valid definition builds', () => {
    expect(() => build({})).not.toThrow()
  })
})

describe('the panel is complete', () => {
  test('nothing is a placeholder any more', () => {
    expect(panelRegistry.controls.filter((def) => def.type === 'placeholder')).toEqual([])
  })

  test('every control holds a value and every decoration does not', () => {
    /* Four of the decorations became controls when Output was built: two
       volumes and two switches. What is left is the sockets, the lamps, the
       mains switch and the keyboard, which is played rather than set. */
    expect(panelRegistry.controls).toHaveLength(47)
    expect(panelRegistry.decorations.map((item) => item.id)).toEqual([
      'overloadLamp',
      'phonesJack',
      'powerLamp',
      'power',
      'keyboard',
    ])
  })

  test('both wheels are wheels', () => {
    expect(panelRegistry.controls.filter(isWheel).map((w) => w.id)).toEqual([
      'pitchWheel',
      'modWheel',
    ])
  })
})

describe('the surface turns as a whole', () => {
  const FRACTIONS = [0, 0.1, 0.25, 1 / 3, 0.5, 0.66, 0.75, 0.9, 1]

  test('the ribs move exactly as far as the marker, because they are on it', () => {
    for (const fraction of FRACTIONS) {
      expect(surfaceShift(fraction)).toBeCloseTo(markerY(fraction) - markerY(0), 10)
    }
  })

  test('the pattern runs past both ends of the face wherever it is turned to', () => {
    /* The failure this guards is the surface running out: turn it far enough
       and the top or bottom of the wheel goes blank. A gap landing on the edge
       is fine — the gaps are part of the surface — so what has to hold is that
       the next rib along would be past the edge, not that a rib covers it. */
    for (const fraction of FRACTIONS) {
      const tops = ribTops(surfaceShift(fraction))
      expect(Math.min(...tops) + RIB_HEIGHT).toBeLessThanOrEqual(FACE.y + RIB_PITCH)
      expect(Math.max(...tops) + RIB_PITCH).toBeGreaterThanOrEqual(FACE.y + FACE.height)
    }
  })

  test('never draws much more than the face can show', () => {
    const covered = FACE.height / RIB_PITCH
    for (const fraction of FRACTIONS) {
      expect(ribTops(surfaceShift(fraction)).length).toBeLessThanOrEqual(covered + 3)
    }
  })

  test('a turn of one pitch looks the same as no turn at all', () => {
    /* Which is what makes wrapping the shift safe: the surface repeats. */
    expect(ribTops(RIB_PITCH)).toEqual(ribTops(0))
    expect(ribTops(-RIB_PITCH)).toEqual(ribTops(0))
  })

  test('a turn of less than a pitch moves the whole pattern by exactly that much', () => {
    /* Compared by phase rather than rib for rib: a turn brings one more rib into
       view at one end as it takes one out at the other, so the two lists are not
       always the same length. */
    const phase = (y: number) => ((y % RIB_PITCH) + RIB_PITCH) % RIB_PITCH
    for (const top of ribTops(2.5)) {
      expect(phase(top - 2.5)).toBeCloseTo(phase(RIB_BASE), 10)
    }
  })
})
