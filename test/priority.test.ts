import { describe, expect, test } from 'bun:test'
import { sounding, trigger } from '@audio/priority.ts'

describe('one voice, many keys', () => {
  test('sounds the lowest key held', () => {
    expect(sounding([])).toBe(null)
    expect(sounding([20])).toBe(20)
    expect(sounding([20, 12, 31])).toBe(12)
  })

  test('starts the contours only from an empty keyboard', () => {
    expect(trigger([], [20])).toBe('attack')
    expect(trigger([20], [20, 24])).toBe('none')
  })

  /* A lower key taken while a higher one is held steals the voice, and slides to
     it rather than striking it again. That is what makes Glide audible: struck
     notes would have nothing to glide from. */
  test('slides to a new lowest note without striking it', () => {
    expect(trigger([20], [20, 15])).toBe('glide')
    expect(trigger([20, 15], [20])).toBe('glide')
  })

  test('releases when the last key comes up', () => {
    expect(trigger([20], [])).toBe('release')
    expect(trigger([20, 15], [20])).not.toBe('release')
    expect(trigger([], [])).toBe('none')
  })
})
