import {
  DEFAULT_SKIN,
  isHexColour,
  SKIN_SHEETS,
  SKIN_SWATCHES,
  type Skin,
  type SkinSwatch,
} from '@/tones.ts'

/* Turning a preview into something that can be asked for.
 *
 * The colours the app ships with live in source, so changing them is a commit
 * and not a click. This writes the request: what to change, where both copies of
 * it are, and to stop there.
 *
 * A plain string function rather than something the dialog builds as it draws,
 * so what it says can be pinned by a test that never renders anything — which is
 * what stops the wording drifting away from the files it names.
 */

/* Where a default is written down. Named in the prompt, and checked against the
   filesystem by `exportPrompt.test.ts`, so a rename fails here rather than in a
   paste six weeks later. The stylesheet is not one file: the chrome's colours
   and the instrument's are declared apart, so only the sheets a change actually
   touches are named. */
const SOURCES = {
  constant: 'src/tones.ts',
  lock: 'test/skin.test.ts',
} as const

function sheetsFor(changes: readonly ColourChange[]): string {
  const named = [...new Set(changes.map(({ swatch }) => SKIN_SHEETS[swatch.sheet]))].sort()
  const blocks = named.length === 1 ? 'the :root block in' : ':root blocks in'
  return `${blocks} ${named.join(' and ')}`
}

export interface ColourChange {
  readonly swatch: SkinSwatch
  readonly from: string
  readonly to: string
}

/* What differs from what the app ships with, in the order the fields are drawn.
   Compared by value rather than by which keys the skin holds: an entry edited by
   hand can name a colour and give it the default, and that is not a change.
   `isHexColour` again because this text is pasted into an agent session, and the
   hex is the only part of it a form controls. */
export function skinChanges(skin: Skin): readonly ColourChange[] {
  const changes: ColourChange[] = []
  for (const swatch of SKIN_SWATCHES) {
    const to = skin[swatch.key]
    const from = DEFAULT_SKIN[swatch.key]!
    if (isHexColour(to) && to !== from) changes.push({ swatch, from, to })
  }
  return changes
}

export function exportPrompt(changes: readonly ColourChange[]): string {
  const colours = changes.length === 1 ? 'colour' : 'colours'
  const lines = changes.map(
    ({ swatch, from, to }) =>
      `  - ${swatch.label} (${swatch.property}, \`${swatch.key}\`): ${from} → ${to}`,
  )

  /* One line per paragraph, wrapped by whatever it is read in. Hard-wrapping
     here looked tidy in the source and ragged in the dialog, which wraps it
     again at its own width. */
  return [
    `Change the ${colours} the moog app ships with.`,
    '',
    `They are written down twice and ${SOURCES.lock} fails if the two disagree, so both have to change together: DEFAULT_SKIN in ${SOURCES.constant}, and ${sheetsFor(changes)}.`,
    '',
    `Set these ${changes.length} of the ${SKIN_SWATCHES.length} colours:`,
    '',
    ...lines,
    '',
    'Change nothing else. These are the defaults the app ships with, not a stored setting: there is no server-side skin and no database row to update.',
    '',
    'Then run `bun test` and `bun run lint`, and open a pull request saying what each colour was and what it became.',
    '',
  ].join('\n')
}
