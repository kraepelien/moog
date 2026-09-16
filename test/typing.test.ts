import { describe, expect, test } from 'bun:test'
import { BASE_KEY, keyForTypedKey, offsetForTypedKey } from '../src/audio/typing.ts'
import { KEY_COUNT, noteName } from '../src/audio/notes.ts'

const played = (typed: string, octaves = 0) => keyForTypedKey(typed, octaves, KEY_COUNT)

describe('playing from the computer keyboard', () => {
  test('lays an octave along the bottom row from Z', () => {
    expect(offsetForTypedKey('z')).toBe(0)
    expect(offsetForTypedKey('m')).toBe(11)
    expect(offsetForTypedKey(',')).toBe(12)
  })

  test('puts the black keys on the row above, where they are on a keyboard', () => {
    /* s sits between z and x, as C sharp sits between C and D. */
    expect(offsetForTypedKey('s')).toBe(1)
    expect(offsetForTypedKey('d')).toBe(3)
    expect(offsetForTypedKey('g')).toBe(6)
  })

  test('starts the top row an octave above the bottom one', () => {
    expect(offsetForTypedKey('q')).toBe(12)
    expect(offsetForTypedKey('i')).toBe(24)
  })

  test('is not troubled by shift or capitals', () => {
    expect(offsetForTypedKey('Z')).toBe(0)
    expect(offsetForTypedKey('Q')).toBe(12)
  })

  test('ignores a key that is not a note', () => {
    expect(offsetForTypedKey('p')).toBe(null)
    expect(offsetForTypedKey('Escape')).toBe(null)
    expect(offsetForTypedKey('/')).toBe(null)
  })

  test('sounds a C, so the layout is where the fingers expect', () => {
    expect(noteName(BASE_KEY)).toBe('C3')
    expect(noteName(played('z')!)).toBe('C3')
    expect(noteName(played('q')!)).toBe('C4')
  })

  test('shifts by whole octaves', () => {
    expect(noteName(played('z', 1)!)).toBe('C4')
    expect(noteName(played('z', -1)!)).toBe('C2')
  })

  /* The computer's keyboard is wider than three and a half octaves, and a note
     the instrument has not got is better dropped than folded back into one it
     has, which would play the wrong note rather than none. */
  test('drops a note that falls off either end', () => {
    expect(played('z', -3)).toBe(null)
    expect(played('i', 3)).toBe(null)
    expect(played('z', 0)).toBeGreaterThanOrEqual(0)
  })
})
