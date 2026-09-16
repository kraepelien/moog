/* The keyboard as the instrument carries it: 44 keys running F to C, three and a
   half octaves, sitting to the right of the performance strip.

   Proportions are read off a photograph of the whole instrument, since the
   manual's line art prints the panel alone, so they are taken to the nearest
   unit rather than to the hundredth the knob artwork is measured to. A sharp is
   a little over half the width of a natural and around two thirds its length.

   Naturals are of even width and each sharp sits on the seam between two of
   them, so the pattern is drawn from the note rather than listed. Which keys
   those are is a question about music, not about drawing, so it is answered in
   src/audio/notes.ts and only read here. */

import { KEY_COUNT, isSharp } from '../../audio/notes.ts'

export const WHITE_WIDTH = 34
export const WHITE_LENGTH = 212
export const BLACK_WIDTH = 21
export const BLACK_LENGTH = 134

export interface Key {
  /* Semitones above the lowest F. */
  readonly index: number
  readonly sharp: boolean
  readonly x: number
  readonly width: number
  readonly length: number
}

/* Every natural before every sharp, so drawing them in order lays the sharps
   over the naturals they overlap. */
export function keyboardKeys(): Key[] {
  const naturals: Key[] = []
  const sharps: Key[] = []
  let placed = 0
  for (let index = 0; index < KEY_COUNT; index += 1) {
    if (isSharp(index)) {
      sharps.push({
        index,
        sharp: true,
        x: placed * WHITE_WIDTH - BLACK_WIDTH / 2,
        width: BLACK_WIDTH,
        length: BLACK_LENGTH,
      })
    } else {
      naturals.push({
        index,
        sharp: false,
        x: placed * WHITE_WIDTH,
        width: WHITE_WIDTH,
        length: WHITE_LENGTH,
      })
      placed += 1
    }
  }
  return [...naturals, ...sharps]
}

export function naturalCount(): number {
  let count = 0
  for (let index = 0; index < KEY_COUNT; index += 1) if (!isSharp(index)) count += 1
  return count
}

export const VIEWBOX = {
  x: 0,
  y: 0,
  width: naturalCount() * WHITE_WIDTH,
  height: WHITE_LENGTH,
} as const
