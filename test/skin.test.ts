import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { applySkin, skinValue } from '@/skin.ts'
import {
  DEFAULT_SKIN,
  SKIN_KEYS,
  SKIN_SWATCHES,
  cleanSkin,
  isHexColour,
  shadesOf,
  tagColour,
  TONE_COLOURS,
  toneForTag,
} from '@/tones.ts'

/* The colours an administrator sets, and the two rules that keep them safe:
   only the keys the app declares, and only values that are really colours. Both
   run on the server too — the service imports the same function — so a page
   cannot offer something the routes would refuse. */

describe('sifting a skin', () => {
  test('keeps a colour for a key the app knows', () => {
    expect(cleanSkin({ page: '#112233', green: '#ABC' })).toEqual({
      page: '#112233',
      green: '#abc',
    })
  })

  test('drops a key nothing declares, so a newer build cannot write into this one', () => {
    expect(cleanSkin({ page: '#112233', wallpaper: '#ffffff' })).toEqual({ page: '#112233' })
  })

  /* A skin ends up in a style attribute, so a value that is not a colour is a
     way of writing CSS into the page. */
  test.each([
    ['not a colour', 'rebeccapurple'],
    ['smuggling a declaration', '#fff; background: url(http://elsewhere/)'],
    ['the wrong length', '#ff00'],
    ['no hash', 'ff0000'],
    ['not a string', 7],
  ])('refuses %s', (_label, value) => {
    expect(isHexColour(value)).toBe(false)
    expect(cleanSkin({ page: value })).toEqual({})
  })

  test('is unbothered by something that is not an object at all', () => {
    expect(cleanSkin(null)).toEqual({})
    expect(cleanSkin('#fff')).toEqual({})
  })
})

describe('painting it', () => {
  const root = () => document.createElement('div')

  test('writes each chosen colour onto the property that draws it', () => {
    const element = root()
    applySkin({ page: '#101010', green: '#00ff00' }, element)
    expect(element.style.getPropertyValue('--shell-page')).toBe('#101010')
    expect(element.style.getPropertyValue('--tone-green-ink')).toBe('#00ff00')
  })

  /* Removed rather than left behind, so putting a colour back to the default is
     the same operation as choosing one — otherwise the page could never undo an
     edit without knowing the stylesheet's value. */
  test('takes a property back off when the skin stops naming it', () => {
    const element = root()
    applySkin({ page: '#101010' }, element)
    applySkin({}, element)
    expect(element.style.getPropertyValue('--shell-page')).toBe('')
  })
})

describe('the defaults written down twice', () => {
  const css = readFileSync(new URL('../src/shellPalette.css', import.meta.url), 'utf8')

  /* The stylesheet is what the app draws with and DEFAULT_SKIN is what the
     layout page shows in a field nobody has touched. Two copies of one fact, so
     this is what stops them drifting. */
  test('agree with the stylesheet, property for property', () => {
    for (const swatch of SKIN_SWATCHES) {
      const declared = css.includes(`${swatch.property}: ${DEFAULT_SKIN[swatch.key]};`)
      expect([swatch.key, declared]).toEqual([swatch.key, true])
    }
  })

  test('name every key, and nothing else', () => {
    expect(Object.keys(DEFAULT_SKIN).sort()).toEqual([...SKIN_KEYS].sort())
  })

  test('are what an untouched field shows', () => {
    expect(skinValue({}, 'page')).toBe(DEFAULT_SKIN.page!)
    expect(skinValue({ page: '#123456' }, 'page')).toBe('#123456')
  })
})

describe('a tag that was given a colour', () => {
  test('is drawn in it, with the wash mixed from the same ink', () => {
    const chosen = tagColour({ Bass: '#ff0000' }, 'Bass')
    expect(chosen.ink).toBe('#ff0000')
    expect(chosen).toEqual(shadesOf('#ff0000'))
    expect(chosen.field).toContain('#ff0000')
  })

  /* A patch stores the tag's name and points at no row, so one the list has
     since forgotten still has to be drawable. */
  test('falls back to the hash when nobody has chosen', () => {
    expect(tagColour({}, 'Bass')).toEqual(TONE_COLOURS[toneForTag('Bass')])
    expect(tagColour({ Lead: '#ff0000' }, 'Bass')).toEqual(TONE_COLOURS[toneForTag('Bass')])
  })
})
