import { describe, expect, test } from 'bun:test'
import { matchPosition } from '../src/controls/discrete.ts'
import { panelRegistry } from '../src/controls/panel.ts'
import type { StepKnobDef } from '../src/controls/stepKnob.ts'
import type { ToggleSwitchDef } from '../src/controls/toggleSwitch.ts'

const range = panelRegistry.control('osc1Range') as StepKnobDef
const waveform = panelRegistry.control('osc1Waveform') as StepKnobDef

describe('typing a position on the range knob', () => {
  test('the printed label works', () => {
    expect(matchPosition(range, "8'")).toBe('ft8')
    expect(matchPosition(range, 'LO')).toBe('lo')
  })

  test('the bare number works, punctuation ignored', () => {
    /* "8" has to find the position printed 8' and stored ft8. */
    expect(matchPosition(range, '8')).toBe('ft8')
    expect(matchPosition(range, '32')).toBe('ft32')
  })

  test('the stored id works', () => {
    expect(matchPosition(range, 'ft16')).toBe('ft16')
  })

  test('case and surrounding space do not matter', () => {
    expect(matchPosition(range, '  lo  ')).toBe('lo')
    expect(matchPosition(range, 'FT4')).toBe('ft4')
  })

  test('a position that does not exist returns null', () => {
    expect(matchPosition(range, '64')).toBeNull()
    expect(matchPosition(range, '')).toBeNull()
    expect(matchPosition(range, '   ')).toBeNull()
  })
})

describe('typing a waveform', () => {
  test('the full name works', () => {
    expect(matchPosition(waveform, 'Sawtooth')).toBe('sawtooth')
    expect(matchPosition(waveform, 'narrow pulse')).toBe('narrowPulse')
  })

  test('an unambiguous prefix works', () => {
    expect(matchPosition(waveform, 'saw')).toBe('sawtooth')
    expect(matchPosition(waveform, 'sq')).toBe('square')
  })

  test('an ambiguous prefix stays ambiguous rather than guessing', () => {
    /* Triangle and Triangle-saw both start with "tri"; picking one would be a
       coin toss the typist never sees. */
    expect(matchPosition(waveform, 'tri')).toBeNull()
  })

  test('an exact label still wins over the ambiguity', () => {
    expect(matchPosition(waveform, 'Triangle')).toBe('triangle')
    expect(matchPosition(waveform, 'Triangle-saw')).toBe('triangleSaw')
  })
})

describe('it works for any discrete control', () => {
  test('a switch resolves its two positions too', () => {
    const noise = panelRegistry.control('noiseColour') as ToggleSwitchDef
    expect(matchPosition(noise, 'pink')).toBe('pink')
    expect(matchPosition(noise, 'White')).toBe('white')
    expect(matchPosition(noise, 'blue')).toBeNull()
  })

  test('every position of every step knob is reachable by its own label', () => {
    for (const def of panelRegistry.controls) {
      if (def.type !== 'stepKnob') continue
      for (const position of (def as StepKnobDef).positions) {
        expect(matchPosition(def as StepKnobDef, position.label)).toBe(position.id)
        expect(matchPosition(def as StepKnobDef, position.id)).toBe(position.id)
      }
    }
  })
})
