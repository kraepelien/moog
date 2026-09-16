/* Playing the instrument from a MIDI keyboard.
 *
 * An anachronism, and worth saying so: the Model D predates MIDI by thirteen
 * years and has no socket for it. What is faithful is the other end, where a
 * controller's three gestures are exactly the three the instrument has — keys,
 * a bend wheel and a modulation wheel — so nothing has to be invented to decide
 * where a message goes.
 *
 * Velocity is read only to tell a note on from a note off. The keyboard is not
 * velocity sensitive, so how hard a key is struck is not information the
 * instrument has anywhere to put.
 *
 * Reading messages is kept apart from receiving them: this module is a function
 * of some bytes, and is tested as one.
 */

import { KEY_COUNT, LOWEST_MIDI } from './notes.ts'

export type MidiEvent =
  | { readonly kind: 'noteOn'; readonly key: number }
  | { readonly kind: 'noteOff'; readonly key: number }
  /* -1 to 1, before the wheel's own range is known. */
  | { readonly kind: 'bend'; readonly fraction: number }
  /* 0 to 1, likewise. */
  | { readonly kind: 'mod'; readonly fraction: number }
  | { readonly kind: 'allOff' }

const NOTE_OFF = 0x80
const NOTE_ON = 0x90
const CONTROL = 0xb0
const BEND = 0xe0

const MOD_WHEEL = 1
/* Every controller sends one of these when a panic button is hit or a program
   changes, and a note left sounding after that is the worst failure a
   synthesiser has. */
const ALL_SOUND_OFF = 120
const ALL_NOTES_OFF = 123

/* Bend arrives as fourteen bits across two, centred rather than starting at
   zero, which is why it is the one message that needs arithmetic. */
const BEND_CENTRE = 0x2000

/* Which key of the instrument a note number plays, or null when the note is
   outside the three and a half octaves it has. Ignored rather than folded back
   into range, as a typed note is: a controller with 88 keys should leave the
   ends silent rather than play the wrong octave. */
export function keyForNote(note: number): number | null {
  const key = note - LOWEST_MIDI
  return key >= 0 && key < KEY_COUNT ? key : null
}

export function readMidi(data: ArrayLike<number>): MidiEvent | null {
  if (data.length < 2) return null
  /* The channel is deliberately not read. The instrument is one voice with one
     keyboard, so a controller set to any channel should play it rather than
     appear broken. */
  const status = data[0]! & 0xf0

  if (status === NOTE_ON || status === NOTE_OFF) {
    const key = keyForNote(data[1]!)
    if (key === null) return null
    /* A note on with no velocity is how most controllers say note off. */
    const struck = status === NOTE_ON && (data[2] ?? 0) > 0
    return struck ? { kind: 'noteOn', key } : { kind: 'noteOff', key }
  }

  if (status === CONTROL) {
    const controller = data[1]!
    if (controller === MOD_WHEEL) return { kind: 'mod', fraction: (data[2] ?? 0) / 127 }
    if (controller === ALL_NOTES_OFF || controller === ALL_SOUND_OFF) return { kind: 'allOff' }
    return null
  }

  if (status === BEND) {
    const raw = ((data[2] ?? 0) << 7) | (data[1]! & 0x7f)
    /* The travel each side of centre is uneven by one step, so dividing by the
       centre and clamping keeps the ends at exactly -1 and 1 rather than
       letting the upper end fall short. */
    return { kind: 'bend', fraction: Math.max(-1, Math.min(1, (raw - BEND_CENTRE) / BEND_CENTRE)) }
  }

  return null
}

/* Nothing to nearly everything, which is what a bend of -1 to 1 becomes once it
   is asked to sit somewhere on a wheel. */
export function unitOfBend(fraction: number): number {
  return (fraction + 1) / 2
}

/* A 0-to-1 reading onto a control's own travel. Passed the range rather than
   reading it, so nothing here has to know what a wheel is called or how far it
   goes; a symmetric wheel therefore rests at its own centre without this
   knowing that is what centre means. */
export function acrossRange(unit: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, min + unit * (max - min)))
}
