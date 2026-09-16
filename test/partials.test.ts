import { describe, expect, test } from 'bun:test'
import { PARTIAL_COUNT, WAVE_IDS, partialsFor, type WaveId } from '../src/audio/partials.ts'
import { panelRegistry } from '../src/controls/panel.ts'
import { isStepKnob } from '../src/controls/stepKnob.ts'

/* Properties of each shape rather than its coefficients: the series are the
   textbook ones, so a test that restated them would only be checking the
   arithmetic against itself. What matters is that each wave still sounds like
   the shape the panel draws. */

const amplitude = (wave: WaveId, n: number) => Math.abs(partialsFor(wave).imag[n]!)

/* The tables are Float32Array, as Web Audio takes them, so a ratio of two
   coefficients agrees to about seven figures and no further. */
const FLOAT32 = 6

describe('every wave', () => {
  test('carries no constant offset', () => {
    for (const wave of WAVE_IDS) {
      expect(partialsFor(wave).real.every((value) => value === 0), wave).toBe(true)
      expect(partialsFor(wave).imag[0], wave).toBe(0)
    }
  })

  test('is band-limited to the same number of harmonics', () => {
    for (const wave of WAVE_IDS) {
      expect(partialsFor(wave).imag.length, wave).toBe(PARTIAL_COUNT)
      expect(partialsFor(wave).real.length, wave).toBe(PARTIAL_COUNT)
    }
  })

  /* The knob is the inventory: a position with no harmonics would draw on the
     panel and sound as nothing. */
  test('the panel names is built', () => {
    const positions = panelRegistry.controls
      .filter(isStepKnob)
      .filter((def) => def.id.endsWith('Waveform'))
      .flatMap((def) => def.positions.map((position) => position.id))
    expect(positions.length).toBeGreaterThan(0)
    for (const id of new Set(positions)) {
      expect(WAVE_IDS, id).toContain(id as WaveId)
    }
  })
})

describe('the shapes', () => {
  test('the square has no even harmonics', () => {
    expect(amplitude('square', 2)).toBeCloseTo(0, FLOAT32)
    expect(amplitude('square', 4)).toBeCloseTo(0, FLOAT32)
    expect(amplitude('square', 3)).toBeGreaterThan(0)
  })

  test("the sawtooth's harmonics fall as 1/n", () => {
    expect(amplitude('sawtooth', 2) / amplitude('sawtooth', 1)).toBeCloseTo(1 / 2, FLOAT32)
    expect(amplitude('sawtooth', 4) / amplitude('sawtooth', 1)).toBeCloseTo(1 / 4, FLOAT32)
  })

  test("the triangle's fall as 1/n², odd only", () => {
    expect(amplitude('triangle', 2)).toBe(0)
    expect(amplitude('triangle', 3) / amplitude('triangle', 1)).toBeCloseTo(1 / 9, FLOAT32)
  })

  test('the reverse sawtooth is the sawtooth turned over', () => {
    const saw = partialsFor('sawtooth').imag
    const reverse = partialsFor('reverseSawtooth').imag
    for (let n = 1; n < PARTIAL_COUNT; n += 1) expect(reverse[n]).toBeCloseTo(-saw[n]!, FLOAT32)
  })

  /* What tells the two pulses apart by ear: the narrower the pulse, the more of
     its energy sits high up, which is the thin reedy sound. */
  test('the narrow pulse is brighter than the wide one', () => {
    const above = (wave: WaveId) => {
      let sum = 0
      for (let n = 10; n < PARTIAL_COUNT; n += 1) sum += amplitude(wave, n) ** 2
      return sum / partialsFor(wave).imag.reduce((total, value) => total + value * value, 0)
    }
    expect(above('narrowPulse')).toBeGreaterThan(above('widePulse'))
    expect(above('widePulse')).toBeGreaterThan(above('square'))
  })

  /* The panel draws it leaning most of the way over, so it should sit between
     the two waves it is drawn between: richer than a triangle, and not yet a
     sawtooth. */
  test('the triangle-saw falls between the triangle and the sawtooth', () => {
    const second = (wave: WaveId) => amplitude(wave, 2) / amplitude(wave, 1)
    expect(second('triangleSaw')).toBeGreaterThan(second('triangle'))
    expect(second('triangleSaw')).toBeLessThan(second('sawtooth'))
  })
})
