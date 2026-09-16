import { describe, expect, test } from 'bun:test'
import { acrossRange, keyForNote, readMidi, unitOfBend } from '../src/audio/midi.ts'
import { KEY_COUNT, LOWEST_MIDI, noteName } from '../src/audio/notes.ts'

describe('note messages', () => {
  test('play the key that sounds the note', () => {
    const message = readMidi([0x90, 69, 100])
    expect(message).toEqual({ kind: 'noteOn', key: 40 })
    expect(noteName(40)).toBe('A4')
  })

  test('release on a note off', () => {
    expect(readMidi([0x80, 69, 0])).toEqual({ kind: 'noteOff', key: 40 })
  })

  /* How most controllers say note off, and a trap: read as a note on it leaves
     the note sounding for ever. */
  test('release on a note on with no velocity', () => {
    expect(readMidi([0x90, 69, 0])).toEqual({ kind: 'noteOff', key: 40 })
  })

  test('ignore how hard the key was struck, since the instrument cannot', () => {
    expect(readMidi([0x90, 69, 1])).toEqual(readMidi([0x90, 69, 127]))
  })

  /* One voice and one keyboard, so a controller on any channel should play it
     rather than appear broken. */
  test('answer on every channel', () => {
    for (const channel of [0x0, 0x3, 0xf]) {
      expect(readMidi([0x90 | channel, 69, 64])).toEqual({ kind: 'noteOn', key: 40 })
    }
  })

  test('drop notes the instrument has not got', () => {
    expect(keyForNote(LOWEST_MIDI - 1)).toBe(null)
    expect(keyForNote(LOWEST_MIDI + KEY_COUNT)).toBe(null)
    expect(readMidi([0x90, 21, 100])).toBe(null)
    expect(readMidi([0x90, 108, 100])).toBe(null)
    /* Both ends of what it does have. */
    expect(keyForNote(LOWEST_MIDI)).toBe(0)
    expect(keyForNote(LOWEST_MIDI + KEY_COUNT - 1)).toBe(KEY_COUNT - 1)
  })
})

describe('the wheels', () => {
  test('rest at the centre of the bend range', () => {
    expect(readMidi([0xe0, 0x00, 0x40])).toEqual({ kind: 'bend', fraction: 0 })
  })

  test('reach both ends', () => {
    expect(readMidi([0xe0, 0x00, 0x00])).toEqual({ kind: 'bend', fraction: -1 })
    const up = readMidi([0xe0, 0x7f, 0x7f])
    expect(up?.kind).toBe('bend')
    expect(up && 'fraction' in up ? up.fraction : 0).toBeCloseTo(1, 3)
  })

  test('read bend as fourteen bits across the two', () => {
    /* A quarter turn up: the coarse byte alone would round this to nothing. */
    const half = readMidi([0xe0, 0x00, 0x60])
    expect(half && 'fraction' in half ? half.fraction : 0).toBeCloseTo(0.5, 10)
  })

  test('read the modulation wheel from nothing to everything', () => {
    expect(readMidi([0xb0, 1, 0])).toEqual({ kind: 'mod', fraction: 0 })
    expect(readMidi([0xb0, 1, 127])).toEqual({ kind: 'mod', fraction: 1 })
  })

  test('ignore a controller the instrument has no wheel for', () => {
    expect(readMidi([0xb0, 7, 100])).toBe(null)
  })

  /* A note left sounding after a panic is the worst failure a synthesiser has. */
  test('stop everything on all notes off', () => {
    expect(readMidi([0xb0, 123, 0])).toEqual({ kind: 'allOff' })
    expect(readMidi([0xb0, 120, 0])).toEqual({ kind: 'allOff' })
  })
})

describe('putting a reading on a wheel', () => {
  test('rests a symmetric wheel at its own centre', () => {
    expect(acrossRange(unitOfBend(0), -5, 5)).toBe(0)
    expect(acrossRange(unitOfBend(-1), -5, 5)).toBe(-5)
    expect(acrossRange(unitOfBend(1), -5, 5)).toBe(5)
  })

  test('runs a one-sided wheel from end to end', () => {
    expect(acrossRange(0, 0, 10)).toBe(0)
    expect(acrossRange(1, 0, 10)).toBe(10)
    expect(acrossRange(0.5, 0, 10)).toBe(5)
  })

  test('cannot leave the travel', () => {
    expect(acrossRange(2, 0, 10)).toBe(10)
    expect(acrossRange(-2, 0, 10)).toBe(0)
  })
})

describe('messages that are not messages', () => {
  test('are ignored rather than guessed at', () => {
    expect(readMidi([])).toBe(null)
    expect(readMidi([0xf8])).toBe(null)
    expect(readMidi([0xc0, 5])).toBe(null)
  })
})
