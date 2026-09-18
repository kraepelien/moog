import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { exportPrompt, skinChanges } from '@admin/exportPrompt.ts'
import { DEFAULT_SKIN, SKIN_SHEETS, SKIN_SWATCHES } from '@/tones.ts'

/* The prompt is instructions for changing two files, so what stops it being
   wrong is not how it reads but whether the files still say what it claims.
   Everything below reads them. */

const repo = (path: string) => new URL(`../${path}`, import.meta.url)
const promptFor = (skin: Record<string, string>) => exportPrompt(skinChanges(skin))

describe('what counts as a change', () => {
  test('nothing, at the colours the app ships with', () => {
    expect(skinChanges({})).toEqual([])
  })

  /* The page drops a key whose colour is the default, but a session entry
     edited by hand need not, and `#000000 → #000000` is not an instruction. */
  test('not a colour that happens to equal the default', () => {
    expect(skinChanges({ background: DEFAULT_SKIN.background! })).toEqual([])
  })

  test('not something that is not a colour', () => {
    expect(skinChanges({ background: 'rebeccapurple' })).toEqual([])
    expect(skinChanges({ background: '#fff; background: url(http://elsewhere/)' })).toEqual([])
  })

  test('the ones that differ, in the order the fields are drawn', () => {
    const changed = skinChanges({ blue: '#2266ff', contentBg: '#123456' })
    expect(changed.map((change) => change.swatch.key)).toEqual(['contentBg', 'blue'])
    expect(changed[0]).toMatchObject({ from: DEFAULT_SKIN.contentBg!, to: '#123456' })
  })
})

describe('the prompt it writes', () => {
  /* Each swatch on its own, so a colour whose label or property is wrong cannot
     hide behind the rest that are right. */
  test.each(SKIN_SWATCHES.map((swatch) => [swatch.key, swatch] as const))(
    'names %s by its label, its property and what it is now',
    (_key, swatch) => {
      const prompt = promptFor({ [swatch.key]: '#123456' })
      expect(prompt).toContain(swatch.label)
      expect(prompt).toContain(swatch.property)
      expect(prompt).toContain(`\`${swatch.key}\``)
      expect(prompt).toContain(`${DEFAULT_SKIN[swatch.key]!} → #123456`)
    },
  )

  test('counts what it is asking for, and says it in the singular when it is one', () => {
    expect(promptFor({ contentBg: '#123456' }))
      .toContain(`Set these 1 of the ${SKIN_SWATCHES.length} colours`)
    expect(promptFor({ contentBg: '#123456' })).toContain('Change the colour the moog app ships')
    expect(promptFor({ contentBg: '#123456', blue: '#2266ff' })).toContain('Change the colours')
  })

  test('asks for the pull request, which is the point of exporting one', () => {
    expect(promptFor({ contentBg: '#123456' })).toContain('open a pull request')
  })

  /* Exporting a colour nothing reads yet is a real thing to want, and the
     instruction is the same. What differs is that the change is invisible, and
     an agent not told so would take that for a mistake of its own. */
  test('warns when a colour it is asking for repaints nothing yet', () => {
    const pending = SKIN_SWATCHES.find((swatch) => swatch.pending)!
    expect(promptFor({ [pending.key]: '#123456' })).toContain('repaints nothing')
    expect(promptFor({ contentBg: '#123456' })).not.toContain('repaints nothing')
  })
})

describe('the files it tells somebody to edit', () => {
  const named = [...promptFor({ contentBg: '#123456' }).matchAll(/[\w/.-]+\.(?:ts|tsx|css)/g)].map(
    (match) => match[0],
  )

  test('are named at all', () => {
    expect(named.length).toBeGreaterThan(0)
  })

  test('all exist', () => {
    for (const path of named) expect([path, existsSync(repo(path))]).toEqual([path, true])
  })

  test('hold the things it names inside them', () => {
    expect(readFileSync(repo('src/tones.ts'), 'utf8')).toContain('DEFAULT_SKIN')
    for (const path of Object.values(SKIN_SHEETS)) {
      expect([path, readFileSync(repo(path), 'utf8').includes(':root')]).toEqual([path, true])
    }
  })

  /* The instrument's colours live in their own stylesheet, so a prompt that
     always named the chrome's would send somebody to a file without the
     property in it. */
  test('name the stylesheet the changed colour is actually declared in', () => {
    expect(promptFor({ contentBg: '#123456' })).toContain(SKIN_SHEETS.shell)
    expect(promptFor({ contentBg: '#123456' })).not.toContain(SKIN_SHEETS.panel)

    expect(promptFor({ capOrange: '#123456' })).toContain(SKIN_SHEETS.panel)
    expect(promptFor({ capOrange: '#123456' })).not.toContain(SKIN_SHEETS.shell)

    const both = promptFor({ contentBg: '#123456', capOrange: '#123456' })
    expect(both).toContain(SKIN_SHEETS.shell)
    expect(both).toContain(SKIN_SHEETS.panel)
  })

  /* The whole reason both files are named: a change landing in one of them and
     not the other passes the eye and fails the suite. */
  test('each say the colour the prompt quotes as the old one', () => {
    const sheets = Object.fromEntries(
      Object.entries(SKIN_SHEETS).map(([name, path]) => [name, readFileSync(repo(path), 'utf8')]),
    )
    const constant = readFileSync(repo('src/tones.ts'), 'utf8')
    for (const swatch of SKIN_SWATCHES) {
      const was = DEFAULT_SKIN[swatch.key]!
      const css = sheets[swatch.sheet]!
      expect(promptFor({ [swatch.key]: '#123456' })).toContain(`${was} → #123456`)
      expect([swatch.key, css.includes(`${swatch.property}: ${was};`)]).toEqual([swatch.key, true])
      expect([swatch.key, constant.includes(`${swatch.key}: '${was}'`)]).toEqual([swatch.key, true])
    }
  })
})
