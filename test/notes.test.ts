import { describe, expect, test } from 'bun:test'
import {
  KEY_COUNT,
  centsForKey,
  hzForKey,
  hzForMidi,
  isSharp,
  midiForKey,
  noteName,
} from '@audio/notes.ts'

describe('what the keys sound', () => {
  test('runs 44 keys from F to C', () => {
    expect(KEY_COUNT).toBe(44)
    expect(noteName(0)).toBe('F1')
    expect(noteName(KEY_COUNT - 1)).toBe('C5')
    expect(isSharp(0)).toBe(false)
    expect(isSharp(KEY_COUNT - 1)).toBe(false)
  })

  test('spans three and a half octaves', () => {
    expect(midiForKey(KEY_COUNT - 1) - midiForKey(0)).toBe(43)
  })

  test('doubles in frequency every twelve keys', () => {
    expect(hzForKey(12)).toBeCloseTo(hzForKey(0) * 2, 10)
    expect(hzForKey(24)).toBeCloseTo(hzForKey(0) * 4, 10)
  })

  /* A-440 is the one frequency the panel itself states, which makes this the
     check anyone can make by ear: switch it on and play this key. */
  test('puts A440 on a key', () => {
    const a = [...Array(KEY_COUNT).keys()].find((index) => noteName(index) === 'A4')
    expect(a).toBe(40)
    expect(hzForKey(40)).toBeCloseTo(440, 10)
    expect(hzForMidi(69)).toBe(440)
  })

  test('counts cents from the bottom key rather than from a pitch', () => {
    expect(centsForKey(0)).toBe(0)
    expect(centsForKey(12)).toBe(1200)
  })

  test('names the sharps as sharps, and there are eighteen', () => {
    expect(noteName(1)).toBe('F♯1')
    expect(isSharp(1)).toBe(true)
    expect([...Array(KEY_COUNT).keys()].filter(isSharp)).toHaveLength(18)
  })
})
