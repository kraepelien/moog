import { describe, expect, test } from 'bun:test'
import {
  decimalsFor,
  isContinuousKnob,
  quantise,
  type ContinuousKnobDef,
} from '../src/controls/continuousKnob.ts'
import { panelRegistry } from '../src/controls/panel.ts'
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
