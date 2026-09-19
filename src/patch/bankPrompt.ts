import type { ControlValue } from '@controls/types.ts'
import type { Patch } from './schema.ts'

/* Turning a correction into something that can be asked for.
 *
 * Correcting a factory patch writes the database row, which is the live bank and
 * is what everybody on this install loads. It does not touch `bank/<slug>.json`
 * in the repo, and nothing may: a file that reached a row that already exists
 * would be a way to discard corrections by accident. But the repo file is what
 * seeds a *fresh* database, so left alone it goes on seeding the wrong values
 * somewhere else.
 *
 * This writes the request to bring the file in line: which slug, which controls,
 * and to stop there. The same shape `exportPrompt.ts` uses for the skin, and for
 * the same reason: a plain string function, so a test can pin the wording
 * without rendering anything.
 */

const SOURCE = 'bank'

export interface ValueChange {
  readonly control: string
  readonly from: ControlValue | undefined
  readonly to: ControlValue | undefined
}

export interface Correction {
  readonly slug: string
  readonly name: { readonly from: string; readonly to: string } | null
  readonly notes: { readonly from: string; readonly to: string } | null
  readonly values: readonly ValueChange[]
}

/* What the draft says that the row it was loaded from did not. Both sides are
   the patch as stored, never the panel's resolved reading: a control the file
   leaves out is Init on purpose, and writing that default in would turn an
   honest omission into a stored setting. */
export function correctionOf(before: Patch, after: Patch): Correction {
  const controls = [...new Set([...Object.keys(before.values), ...Object.keys(after.values)])]

  return {
    slug: before.id,
    name: before.name === after.name ? null : { from: before.name, to: after.name },
    notes: before.notes === after.notes ? null : { from: before.notes, to: after.notes },
    values: controls
      .filter((control) => before.values[control] !== after.values[control])
      .sort()
      .map((control) => ({
        control,
        from: before.values[control],
        to: after.values[control],
      })),
  }
}

export function isEmpty(correction: Correction): boolean {
  return (
    correction.name === null && correction.notes === null && correction.values.length === 0
  )
}

const quoted = (value: ControlValue | undefined) =>
  typeof value === 'string' ? `"${value}"` : String(value)

function line(change: ValueChange): string {
  /* A control the correction *removes* is one going back to Init, and the file
     says that by leaving it out rather than by naming a default. */
  if (change.to === undefined) {
    return `- remove "${change.control}", which was ${quoted(change.from)}, so it falls back to the registry default`
  }
  if (change.from === undefined) {
    return `- add "${change.control}": ${quoted(change.to)}`
  }
  return `- set "${change.control}" to ${quoted(change.to)} (it currently says ${quoted(change.from)})`
}

export function bankPrompt(correction: Correction): string {
  const file = `${SOURCE}/${correction.slug}.json`
  const parts: string[] = [`In ${file}, correct the transcription of this factory patch.`]

  if (correction.name) {
    parts.push('', `Set "name" to ${JSON.stringify(correction.name.to)}.`)
  }
  if (correction.notes) {
    parts.push('', `Set "notes" to ${JSON.stringify(correction.notes.to)}.`)
  }
  if (correction.values.length > 0) {
    parts.push('', 'Under "values":', ...correction.values.map(line))
  }

  parts.push(
    '',
    /* Said because the difference is the whole reason this prompt exists, and
       somebody reading it a week later will not have the page in front of them. */
    `This install's database row has already been corrected and is the live bank here; ${file} is what seeds a database that does not hold this slug yet, so it is the copy still carrying the old values.`,
    '',
    'Change nothing else. Leave every other control in the file alone, including the ones it does not mention: an omission there means the registry default on purpose. Do not add a route, a flag or anything else that would push a file over a row that already exists.',
  )

  return parts.join('\n')
}
