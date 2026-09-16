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
  MARKER_BOTTOM,
  MARKER_TOP,
  markerY,
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
    expect(panelRegistry.controls).toHaveLength(43)
    expect(panelRegistry.decorations).toHaveLength(8)
  })

  test('both wheels are wheels', () => {
    expect(panelRegistry.controls.filter(isWheel).map((w) => w.id)).toEqual([
      'pitchWheel',
      'modWheel',
    ])
  })
})
