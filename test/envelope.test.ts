import { describe, expect, test } from 'bun:test'
import { IDLE, levelAt, stageAt, type Running } from '@audio/envelope.ts'
import type { EnvelopeSettings } from '@audio/settings.ts'

const shape: EnvelopeSettings = {
  attackSeconds: 1,
  decaySeconds: 2,
  sustain: 0.5,
  releaseSeconds: 4,
}

const pressed = (at = 0): Running => ({ stage: 'attack', since: at, from: 0 })

describe('a contour under a held key', () => {
  test('rises to full over the attack', () => {
    expect(levelAt(pressed(), shape, 0)).toBe(0)
    expect(levelAt(pressed(), shape, 0.5)).toBeCloseTo(0.5, 10)
    expect(levelAt(pressed(), shape, 1)).toBeCloseTo(1, 10)
  })

  test('falls to the sustain over the decay, and then holds', () => {
    expect(levelAt(pressed(), shape, 2)).toBeCloseTo(0.75, 10)
    expect(levelAt(pressed(), shape, 3)).toBeCloseTo(0.5, 10)
    expect(levelAt(pressed(), shape, 30)).toBeCloseTo(0.5, 10)
  })

  test('names the stage it is in', () => {
    expect(stageAt(pressed(), shape, 0.5)).toBe('attack')
    expect(stageAt(pressed(), shape, 2)).toBe('decay')
    expect(stageAt(pressed(), shape, 10)).toBe('sustain')
    expect(stageAt(IDLE, shape, 10)).toBe('idle')
  })
})

describe('a contour after the key is let go', () => {
  test('falls from where it was to nothing', () => {
    const releasing: Running = { stage: 'release', since: 10, from: 0.5 }
    expect(levelAt(releasing, shape, 10)).toBe(0.5)
    expect(levelAt(releasing, shape, 12)).toBeCloseTo(0.25, 10)
    expect(levelAt(releasing, shape, 14)).toBeCloseTo(0, 10)
    expect(levelAt(releasing, shape, 100)).toBe(0)
  })

  /* The reason this module exists: a key pressed during a release has to pick
     the envelope up where it is, and asking Web Audio for it is not portable. */
  test('can be picked up part way down', () => {
    const releasing: Running = { stage: 'release', since: 0, from: 1 }
    const caught = levelAt(releasing, shape, 1)
    expect(caught).toBeCloseTo(0.75, 10)
    expect(levelAt({ stage: 'attack', since: 1, from: caught }, shape, 1)).toBe(caught)
  })
})

describe('a contour with no time in it', () => {
  /* Every time knob starts at zero, so this is the default patch, not a corner
     case: the note has to arrive at full and leave at nothing without dividing
     by a zero on the way. */
  test('snaps rather than dividing by nothing', () => {
    const instant: EnvelopeSettings = {
      attackSeconds: 0,
      decaySeconds: 0,
      sustain: 0.3,
      releaseSeconds: 0,
    }
    expect(levelAt(pressed(), instant, 0)).toBe(0.3)
    expect(levelAt({ stage: 'release', since: 0, from: 1 }, instant, 0)).toBe(0)
    expect(levelAt(IDLE, instant, 5)).toBe(0)
  })
})
