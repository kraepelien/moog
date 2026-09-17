import { describe, expect, test } from 'bun:test'
import { sounding, trigger } from '@audio/priority.ts'

describe('one voice, many keys', () => {
  test('sounds the key pressed last', () => {
    expect(sounding([])).toBe(null)
    expect(sounding([20])).toBe(20)
    expect(sounding([20, 12, 31])).toBe(31)
    /* Order of arrival, not pitch: the same three keys in another order sound a
       different note, which is the whole of last-note priority. */
    expect(sounding([31, 20, 12])).toBe(12)
  })

  test('starts the contours only from an empty keyboard', () => {
    expect(trigger([], [20])).toBe('attack')
    expect(trigger([20], [20, 24])).toBe('glide')
  })

  /* Any key taken while another is held steals the voice, and slides to it
     rather than striking it again. That is what makes Glide audible: struck
     notes would have nothing to glide from. */
  test('slides to a newly pressed note without striking it', () => {
    expect(trigger([20], [20, 15])).toBe('glide')
    expect(trigger([20], [20, 24])).toBe('glide')
    /* Lifting the newest key hands the voice back to what is still down, which
       is a slide for the same reason. */
    expect(trigger([20, 15], [20])).toBe('glide')
  })

  /* Lifting a key that was not the one sounding changes nothing, which is the
     one case a lowest-wins rule and a last-wins rule disagree about. */
  test('says nothing happened when an unsounded key comes up', () => {
    expect(trigger([15, 20], [20])).toBe('none')
  })

  test('releases when the last key comes up', () => {
    expect(trigger([20], [])).toBe('release')
    expect(trigger([20, 15], [20])).not.toBe('release')
    expect(trigger([], [])).toBe('none')
  })
})
