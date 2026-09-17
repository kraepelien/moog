import { createSynth, type Synth } from './engine.ts'

/* One instrument per channel of a file, and one audio context behind all of
   them.
 *
 * A browser hands out only a handful of audio contexts, and a file with four
 * parts wants four instruments, so they share. That makes closing one of them
 * unthinkable: close() closes the context, which would silence every other part
 * as well. They are therefore pooled and kept, which is what the engine does
 * with its oscillators and for the same reason — a graph is cheap to hold and
 * cannot be restarted once stopped.
 *
 * A context is not opened until a voice is first asked to play, because a
 * browser will not start one outside a gesture.
 */

let context: AudioContext | null = null

export const sharedContext = (): BaseAudioContext => (context ??= new AudioContext())

const pool = new Map<number, Synth>()

export function voiceFor(channel: number): Synth {
  const held = pool.get(channel)
  if (held) return held

  const made = createSynth(sharedContext)
  pool.set(channel, made)
  return made
}

/* Every voice that has ever been asked for, not just the ones playing now: a
   part that has been reassigned mid-file still has a note down. */
export function silenceVoices(): void {
  for (const voice of pool.values()) voice.allOff()
}
