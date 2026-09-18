import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { applySkin, skinValue } from '@/skin.ts'
import {
  DEFAULT_SKIN,
  SKIN_KEYS,
  SKIN_SHEETS,
  SKIN_SWATCHES,
  cleanSkin,
  isHexColour,
  shadesOf,
  tagColour,
  TONE_COLOURS,
  type Tone,
  toneForTag,
} from '@/tones.ts'

/* The colours the layout page tries out, and the two rules that keep them safe:
   only the keys the app declares, and only values that are really colours. They
   run on whatever `deviceSkin` reads back, which anybody with a console open can
   rewrite, and before the first render rather than after it. */

describe('sifting a skin', () => {
  test('keeps a colour for a key the app knows', () => {
    expect(cleanSkin({ background: '#112233', successColor: '#ABC' })).toEqual({
      background: '#112233',
      successColor: '#abc',
    })
  })

  test('drops a key nothing declares, so a newer build cannot write into this one', () => {
    expect(cleanSkin({ background: '#112233', wallpaper: '#ffffff' })).toEqual({
      background: '#112233',
    })
  })

  /* A skin ends up in a style attribute, so a value that is not a colour is a
     way of writing CSS into the page. */
  test.each([
    ['not a colour', 'rebeccapurple'],
    ['smuggling a declaration', '#fff; background: url(http://elsewhere/)'],
    ['the wrong length', '#ff000'],
    ['no hash', 'ff0000'],
    ['not a string', 7],
  ])('refuses %s', (_label, value) => {
    expect(isHexColour(value)).toBe(false)
    expect(cleanSkin({ background: value })).toEqual({})
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
    applySkin({ background: '#101010', successColor: '#00ff00' }, element)
    expect(element.style.getPropertyValue('--background')).toBe('#101010')
    expect(element.style.getPropertyValue('--success-color')).toBe('#00ff00')
  })

  /* Removed rather than left behind, so putting a colour back to the default is
     the same operation as choosing one — otherwise the page could never undo an
     edit without knowing the stylesheet's value. */
  test('takes a property back off when the skin stops naming it', () => {
    const element = root()
    applySkin({ background: '#101010' }, element)
    applySkin({}, element)
    expect(element.style.getPropertyValue('--background')).toBe('')
  })
})

describe('the defaults written down twice', () => {
  /* Two stylesheets: the chrome's colours and the instrument's are declared
     apart, and each swatch says which one holds it. */
  const sheets = new Map(
    Object.entries(SKIN_SHEETS).map(([name, path]) => [
      name,
      readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'),
    ]),
  )

  /* The stylesheet is what the app draws with and DEFAULT_SKIN is what the
     layout page shows in a field nobody has touched. Two copies of one fact, so
     this is what stops them drifting. */
  test('agree with their stylesheet, property for property', () => {
    for (const swatch of SKIN_SWATCHES) {
      const css = sheets.get(swatch.sheet)!
      const declared = css.includes(`${swatch.property}: ${DEFAULT_SKIN[swatch.key]};`)
      expect([swatch.key, declared]).toEqual([swatch.key, true])
    }
  })

  /* A swatch pointing at the wrong sheet would pass the test above only by the
     other sheet happening to declare the same property, so the pairing is
     checked on its own. */
  test('are declared in the sheet the swatch names, and not the other', () => {
    for (const swatch of SKIN_SWATCHES) {
      for (const [name, css] of sheets) {
        const here = css.includes(`${swatch.property}:`)
        expect([swatch.key, name, here]).toEqual([swatch.key, name, name === swatch.sheet])
      }
    }
  })

  test('name every key, and nothing else', () => {
    expect(Object.keys(DEFAULT_SKIN).sort()).toEqual([...SKIN_KEYS].sort())
  })

  test('are what an untouched field shows', () => {
    expect(skinValue({}, 'background')).toBe(DEFAULT_SKIN.background!)
    expect(skinValue({ background: '#123456' }, 'background')).toBe('#123456')
  })

  /* Red, amber and green have no property and no swatch of their own: the
     status colour is the tone, mixed into the washes and handed out as the ink.
     Giving the tone its own hex back would leave the two free to drift while
     both tests above still passed. */
  test.each([
    ['red', 'error'],
    ['amber', 'warning'],
    ['green', 'success'],
  ])('the %s tone is the %s colour rather than a copy of it', (tone, status) => {
    expect(TONE_COLOURS[tone as Tone].ink).toBe(`var(--${status}-color)`)
    expect(sheets.get('shell')!).not.toContain(`--tone-${tone}-ink`)
    expect(SKIN_KEYS).not.toContain(tone)
  })
})

/* `pending` is the page's claim that the app does not draw with a colour yet,
   so it is worth only as much as its being true: a colour something already
   reads must not be marked, and one nothing reads must be. Wiring a surface up
   is therefore two edits, and forgetting the second fails here rather than in a
   field somebody drags and disbelieves.

   The specimens are not one of those surfaces and are read past. They exist to
   show a colour that has nowhere else to be seen, so counting them would mark
   every one of them applied on the day it got a preview — and the export would
   stop warning that the app itself still ignores it, which is the whole of what
   the flag is for. */
describe('a colour that is settable and not yet applied', () => {
  const specimens = ['admin/Specimens.tsx', 'admin/Specimens.module.css']
  const source = new Map(
    [...new Bun.Glob('**/*.{css,ts,tsx}').scanSync('src')]
      .filter((path) => !specimens.includes(path))
      .map((path) => [path, readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')]),
  )

  test.each(SKIN_SWATCHES.map((swatch) => [swatch.key, swatch] as const))(
    '%s is marked exactly when nothing reads it',
    (_key, swatch) => {
      const read = [...source].some(([, text]) => text.includes(`var(${swatch.property})`))
      expect([swatch.key, read]).toEqual([swatch.key, swatch.pending !== true])
    },
  )
})

/* The other way a colour goes missing, and the quieter one: `var()` on a
   property nothing declares is not an error anywhere. It draws as though the
   rule had not been written, which on a colour looks like a component that was
   never styled — so renaming a property and leaving one reader behind survives
   the build, the linter and the eye.

   Whole names only. `tones.ts` builds a tone's three properties by
   interpolation, and half a name is not something this can check; what covers
   those is that every tone has a chip on the Layout page. */
test('nothing asks for a custom property no stylesheet declares', () => {
  const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
  const files = [...new Bun.Glob('**/*.{css,ts,tsx}').scanSync('src')]
  const declared = new Set(
    files.flatMap((path) => [...read(path).matchAll(/^\s*(--[\w-]+):/gm)].map(([, name]) => name!)),
  )

  for (const path of files) {
    for (const [, asked] of read(path).matchAll(/var\((--[\w-]+)\)/g)) {
      expect([path, asked, declared.has(asked!)]).toEqual([path, asked, true])
    }
  }
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
