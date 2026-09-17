import { describe, expect, test } from 'bun:test'
import {
  BLACK_WIDTH,
  WHITE_WIDTH,
  keyboardKeys,
  naturalCount,
} from '@components/keyboard/keyboardArtwork.ts'
import { KEY_COUNT } from '@audio/notes.ts'

describe('the keyboard', () => {
  test('is 26 naturals and 18 sharps', () => {
    const keys = keyboardKeys()
    expect(keys).toHaveLength(KEY_COUNT)
    expect(naturalCount()).toBe(26)
    expect(keys.filter((key) => key.sharp)).toHaveLength(18)
  })

  test('lays the naturals edge to edge', () => {
    const naturals = keyboardKeys().filter((key) => !key.sharp)
    naturals.forEach((key, position) => expect(key.x).toBe(position * WHITE_WIDTH))
  })

  test('centres each sharp on the seam it sits over', () => {
    for (const key of keyboardKeys().filter((key) => key.sharp)) {
      const seam = key.x + BLACK_WIDTH / 2
      expect(seam % WHITE_WIDTH).toBe(0)
    }
  })

  test('never puts two sharps against each other', () => {
    const sharps = keyboardKeys().filter((key) => key.sharp)
    for (let i = 1; i < sharps.length; i += 1) {
      expect(sharps[i]!.x).toBeGreaterThan(sharps[i - 1]!.x + BLACK_WIDTH)
    }
  })
})
