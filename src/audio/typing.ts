/* Playing the instrument from the computer's own keyboard.
 *
 * The tracker layout, which is the one anybody who has played a synthesiser in
 * a browser already has in their fingers: the bottom two rows are an octave
 * from Z, the top two the octave above from Q, with the black keys on the row
 * above each. It is worth following rather than improving on, since a layout
 * nobody knows has to be read off the screen, and then the mouse would do.
 */

const LOWER = 'zsxdcvgbhnjm,'
const UPPER = 'q2w3er5t6y7ui'

/* Where Z sits on the instrument, as keys from the bottom F. C3 leaves an
   octave below it and two above, which is the middle of a keyboard that starts
   on an F. */
export const BASE_KEY = 19

export const OCTAVE_DOWN = '['
export const OCTAVE_UP = ']'

/* Semitones above the row's own C, or null for a key that is not a note. */
export function offsetForTypedKey(typed: string): number | null {
  const key = typed.toLowerCase()
  const lower = LOWER.indexOf(key)
  if (lower !== -1) return lower
  const upper = UPPER.indexOf(key)
  if (upper !== -1) return upper + 12
  return null
}

/* Which key of the instrument a keystroke plays, or null when it would fall off
   either end: the computer's keyboard is wider than three and a half octaves,
   and a note the instrument does not have is better ignored than wrapped round
   to one it does. */
export function keyForTypedKey(typed: string, octaves: number, keyCount: number): number | null {
  const offset = offsetForTypedKey(typed)
  if (offset === null) return null
  const key = BASE_KEY + offset + octaves * 12
  return key >= 0 && key < keyCount ? key : null
}
