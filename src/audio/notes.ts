/* What each key sounds, as against where it is drawn.
 *
 * Moog names the 44 keys F0 to C4, counting from a middle C called C3, an
 * octave below the convention MIDI and every tuner use. Reconciled here rather
 * than in two places later: the bottom key is MIDI 29 and the top is MIDI 72,
 * and names printed for a screen reader are scientific, which is what a tuner
 * agrees with. The panel prints no note names, so neither convention is being
 * contradicted on screen.
 *
 * A key sounds the note it names when the oscillator is at 8', an organ stop's
 * unison pitch. Every range position moves from there.
 */

export const KEY_COUNT = 44

export const LOWEST_MIDI = 29

/* Semitones above C that are sharps. */
const SHARPS = new Set([1, 3, 6, 8, 10])

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

export function midiForKey(index: number): number {
  return LOWEST_MIDI + index
}

export function isSharp(index: number): boolean {
  return SHARPS.has(midiForKey(index) % 12)
}

/* Equal temperament from A440, which is the tuning the panel's own A-440 switch
   asserts. */
export function hzForMidi(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

export function hzForKey(index: number): number {
  return hzForMidi(midiForKey(index))
}

/* Distance from the bottom key, which is what the keyboard's control voltage
   carries: pitch is summed in cents everywhere downstream, never in hertz,
   because a sum of cents is a product of frequencies. */
export function centsForKey(index: number): number {
  return index * 100
}

export function noteName(index: number): string {
  const midi = midiForKey(index)
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
}
