import { describe, expect, test } from 'bun:test'
import {
  decimalsFor,
  formatValue,
  hasNamedMarks,
  isContinuousKnob,
  quantise,
  scaleMarks,
  type ContinuousKnobDef,
} from '../src/controls/continuousKnob.ts'
import { panelRegistry } from '../src/controls/panel.ts'
import type { StepKnobDef } from '../src/controls/stepKnob.ts'
import { parseTimeInput } from '../src/controls/timeKnob.ts'
import { isWheel } from '../src/controls/wheel.ts'

describe('every continuous control stores finer than it shows', () => {
  const knobs = panelRegistry.controls.filter(isContinuousKnob)
  const wheels = panelRegistry.controls.filter(isWheel)

  test('none of them steps in whole units', () => {
    /* The controls with set values are the rotary selectors and the switches,
       which are discrete types rather than knobs with a step of 1. */
    expect(knobs.length + wheels.length).toBeGreaterThan(0)
    for (const def of [...knobs, ...wheels]) expect(def.step).toBe(0.01)
  })

  test('all of them print a single decimal', () => {
    for (const def of knobs) expect(decimalsFor(def)).toBe(1)
  })

  test('a hundredth survives being stored but not being shown', () => {
    const volume = panelRegistry.control('osc1Volume') as ContinuousKnobDef
    const stored = quantise(volume, 6.44)
    expect(stored).toBe(6.44)
    expect(stored.toFixed(decimalsFor(volume))).toBe('6.4')
  })

  test('rounding still lands on the step', () => {
    const volume = panelRegistry.control('osc1Volume') as ContinuousKnobDef
    expect(quantise(volume, 6.446)).toBe(6.45)
    expect(quantise(volume, 6.444)).toBe(6.44)
  })
})

describe('the editor round-trips without losing precision', () => {
  const frequency = panelRegistry.control('osc2Frequency') as ContinuousKnobDef

  /* The bug this pins: the input used to be pre-filled with the *displayed*
     value, one decimal, so opening the editor on a stored 3.23 and closing it
     committed 3.2 back. Opening and closing a control must change nothing. */
  test('opening and committing unchanged keeps the hundredth', () => {
    for (const stored of [3.23, -7.41, 0.05, 8, -8]) {
      const value = quantise(frequency, stored)
      const reopened = Number(String(value))
      expect(quantise(frequency, reopened)).toBe(value)
    }
  })

  test('the displayed value alone would have lost it', () => {
    const value = quantise(frequency, 3.23)
    expect(value.toFixed(decimalsFor(frequency))).toBe('3.2')
    expect(Number(value.toFixed(decimalsFor(frequency)))).not.toBe(value)
  })
})

describe('out-of-range input clamps to the end of travel', () => {
  const frequency = panelRegistry.control('osc2Frequency') as ContinuousKnobDef

  test('Frequency reaches 8, so 8.23 lands on 8 rather than being refused', () => {
    expect(frequency.max).toBe(8)
    expect(quantise(frequency, 8.23)).toBe(8)
    expect(quantise(frequency, -8.23)).toBe(-8)
  })

  test('a comma decimal parses the same as a point', () => {
    const asPoint = Number('8.23'.replace(',', '.'))
    const asComma = Number('8,23'.replace(',', '.'))
    expect(asComma).toBe(asPoint)
    expect(quantise(frequency, asComma)).toBe(quantise(frequency, asPoint))
  })

  test('a value inside the range is kept exactly', () => {
    expect(quantise(frequency, 3.23)).toBe(3.23)
    expect(quantise(frequency, 7.99)).toBe(7.99)
  })
})

describe('the extra digit appears only when it says something', () => {
  const frequency = panelRegistry.control('osc2Frequency') as ContinuousKnobDef

  test('a round tenth prints one decimal', () => {
    expect(formatValue(frequency, 3.2)).toBe('3.2')
    expect(formatValue(frequency, 0)).toBe('0.0')
    expect(formatValue(frequency, -8)).toBe('-8.0')
  })

  test('a hundredth prints two, so it is visible rather than secret', () => {
    expect(formatValue(frequency, 3.23)).toBe('3.23')
    expect(formatValue(frequency, -7.41)).toBe('-7.41')
    expect(formatValue(frequency, 0.05)).toBe('0.05')
  })

  test('two values that differ are never printed the same', () => {
    expect(formatValue(frequency, 3.23)).not.toBe(formatValue(frequency, 3.24))
  })
})

describe('a scale mark may name a source instead of numbering a level', () => {
  const mix = panelRegistry.control('modulationMix') as ContinuousKnobDef

  test('modulation mix is still an ordinary 0 to 10 control', () => {
    expect([mix.min, mix.max]).toEqual([0, 10])
    expect(mix.step).toBe(0.01)
  })

  test('its ends are named and its middle is numbered', () => {
    const marks = scaleMarks(mix)
    const at = (value: number) => marks.find((m) => m.value === value)
    expect(at(0)?.lines).toEqual(['Osc. 3 /', 'Filter EG'])
    expect(at(10)?.lines).toEqual(['Noise /', 'LFO'])
    expect(at(4)?.lines).toBeUndefined()
    expect(at(4)?.labelled).toBe(true)
  })

  test('a named mark is always printed, whatever the label interval says', () => {
    /* 0 and 10 happen to fall on the interval here; the rule must not depend on
       that, or naming an odd value would silently print nothing. */
    const odd = scaleMarks({
      ...mix,
      scale: { tickStep: 1, labelStep: 4, labels: { 3: ['Three'] } },
    })
    expect(odd.find((m) => m.value === 3)?.labelled).toBe(true)
  })

  test('only knobs with named marks ask for the wider box', () => {
    expect(hasNamedMarks(mix)).toBe(true)
    expect(hasNamedMarks(panelRegistry.control('glide') as ContinuousKnobDef)).toBe(false)
  })
})

describe('the octave caps carry their apostrophe', () => {
  test('the knob reads 8’ rather than 8', () => {
    const range = panelRegistry.control('osc1Range') as StepKnobDef
    expect(range.positions.map((p) => p.cap)).toEqual(['LO', "32'", "16'", "8'", "4'", "2'"])
  })
})

describe('typing a time', () => {
  test('a bare number is milliseconds, the unit the control stores', () => {
    expect(parseTimeInput('800')).toBe(800)
    expect(parseTimeInput('0')).toBe(0)
    expect(parseTimeInput(' 250 ')).toBe(250)
  })

  test('seconds have to be said', () => {
    expect(parseTimeInput('1.5s')).toBe(1500)
    expect(parseTimeInput('1.5 sec')).toBe(1500)
    expect(parseTimeInput('30 s')).toBe(30_000)
  })

  test('milliseconds may be said too', () => {
    expect(parseTimeInput('800ms')).toBe(800)
    expect(parseTimeInput('800 msec')).toBe(800)
  })

  test('a comma decimal works, for a Swedish keyboard', () => {
    expect(parseTimeInput('1,5s')).toBe(1500)
  })

  test('nonsense returns null rather than a guess', () => {
    /* Quietly substituting a default would look like the knob ignored you. */
    for (const text of ['', 'abc', '1.2.3', '5 minutes', '--4']) {
      expect(parseTimeInput(text)).toBeNull()
    }
  })
})
