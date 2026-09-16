import { describe, expect, test } from 'bun:test'
import { calibration, cal, type Entry } from '../src/audio/calibration.ts'

const entries = Object.entries(calibration) as [string, Entry][]

/* The honesty rule, enforced rather than promised: the engine invents numbers
   the instrument never stated, and every one of them has to admit it. A number
   claiming to come from the hardware must say where it is written down. */
describe('every calibrated number', () => {
  test('says what it is and why', () => {
    for (const [name, entry] of entries) {
      expect(Number.isFinite(entry.value)).toBe(true)
      expect(entry.unit.length, name).toBeGreaterThan(0)
      expect(entry.why.length, name).toBeGreaterThan(20)
    }
  })

  test('cites a source unless it admits to being ours', () => {
    for (const [name, entry] of entries) {
      if (entry.source === 'derived') continue
      if (entry.source === 'printed') {
        /* The panel itself is the citation, and there is no file to point at. */
        expect(entry.why, name).toMatch(/panel|prints|printed|organ|octave/)
        continue
      }
      expect(entry.why, name).toMatch(/reference\//)
    }
  })

  test('is reachable as a plain number', () => {
    expect(cal.a440).toBe(440)
    expect(Object.keys(cal)).toEqual(Object.keys(calibration))
  })
})

describe('the ranges', () => {
  /* Feet halve the pitch as they double, so these are not free to be anything:
     a wrong one would put an oscillator an octave out with nothing to catch it. */
  test('run an octave apart, 8ft sounding the note the key names', () => {
    expect(cal.range8).toBe(0)
    expect(cal.range16).toBe(cal.range8 - 1)
    expect(cal.range32).toBe(cal.range16 - 1)
    expect(cal.range4).toBe(cal.range8 + 1)
    expect(cal.range2).toBe(cal.range4 + 1)
  })

  test('put LO below the lowest foot marking', () => {
    expect(cal.rangeLo).toBeLessThan(cal.range32)
  })
})

describe('keyboard tracking', () => {
  test('adds to exactly full when both switches are on', () => {
    expect(cal.trackingStep * (1 + cal.trackingSecond)).toBeCloseTo(1, 10)
  })
})
