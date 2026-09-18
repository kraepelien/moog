import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { panelRegistry } from '@controls/panel.ts'

/* The README's "State of play" counts the panel, and a count written into prose
   goes stale silently: adding a control to `panel.ts` is one line and touches
   nothing that would notice. It had drifted to 43 controls and 8 decorations
   against a registry holding 47 and 5.

   Pinned by reading the sentence rather than by keeping the numbers somewhere
   shared, because the point is the sentence a reader arrives at. */

const ROOT = resolve(import.meta.dir, '..')
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')

const STATE_OF_PLAY = /\*\*All (\d+) controls are specified and built\*\*, plus (\d+) decorations/

describe('the README', () => {
  test('counts the panel the registry actually holds', () => {
    const found = STATE_OF_PLAY.exec(readme)
    /* A null here means the sentence was reworded, not that a number moved: fix
       the pattern to match the new wording rather than deleting the test. */
    expect(found).not.toBeNull()

    expect(Number(found![1])).toBe(panelRegistry.controls.length)
    expect(Number(found![2])).toBe(panelRegistry.decorations.length)
  })

  test('names as many control types as the panel uses', () => {
    const used = new Set(panelRegistry.controls.map((control) => control.type))
    expect(readme).toContain(`${NUMERALS[used.size]} control types cover the instrument`)
  })
})

/* The README spells its counts, and only ever has a handful of types. */
const NUMERALS: Readonly<Record<number, string>> = {
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
}
