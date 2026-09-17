import { readMidi } from './midi.ts'
import type { TimedMessage } from './midiFile.ts'
import type { Synth } from './engine.ts'

/* Playing a file through several instruments at once.
 *
 * Each channel gets an instrument of its own, because a Model D is one voice
 * and a file is not: three parts playing together is three Model Ds, which is
 * what a studio would have done. They share one audio context — a browser gives
 * out only a handful — and nothing here creates one.
 *
 * Notes only. A file's volume, pan and program changes ask the instrument to be
 * something it cannot be, and its wheels move panel controls rather than
 * anything this can reach, so they are dropped rather than half-honoured.
 *
 * The engine plays when told and cannot be told to play later, so this is a
 * clock rather than a schedule: every few milliseconds it hands over whatever
 * has come due. Timing is therefore as good as the timer, which is a few
 * milliseconds out — audible as looseness on a fast run, not as wrong notes.
 */

export interface PlayerVoice {
  readonly channel: number
  /* Silent when a channel has been given no patch, and left out entirely rather
     than given a default: an unassigned part playing some arbitrary sound is
     worse than one that waits. */
  readonly instrument: Synth
  readonly messages: readonly TimedMessage[]
}

/* Injected so the whole thing can be driven a tick at a time in a test, with no
   audio and no waiting. */
export interface Clock {
  /* Seconds, monotonic. */
  now(): number
  after(ms: number, run: () => void): number
  cancel(handle: number): void
}

export const systemClock: Clock = {
  now: () => performance.now() / 1000,
  after: (ms, run) => setTimeout(run, ms) as unknown as number,
  cancel: (handle) => clearTimeout(handle),
}

export interface PlayerState {
  readonly playing: boolean
  /* Seconds into the file, at the file's own tempo whatever the rate. */
  readonly at: number
}

export interface MidiPlayer {
  /* `rate` multiplies the file's own tempo: 1 plays it as written, 1.2 plays it
     a fifth faster. A tempo the file states wrongly is corrected by the caller
     dividing the tempo it should be by the one it claims. */
  play(rate?: number): void
  stop(): void
  /* Which channels are to be heard, everything until said otherwise. A channel
     taken out is silenced where it stands rather than at its next note off,
     because solo and mute are pressed mid-file and a held note would otherwise
     go on sounding under the press. Its notes keep being counted off, so
     putting it back does not resume in the middle of a chord it never heard. */
  hear(channels: ReadonlySet<number>): void
  snapshot(): PlayerState
  subscribe(listener: () => void): () => void
}

interface Cue {
  readonly at: number
  readonly voice: PlayerVoice
  readonly data: readonly number[]
}

/* How often the clock is asked. Short enough that a run of semiquavers is not
   visibly uneven, long enough that a page playing four parts is not spending
   its time here. */
const TICK_MS = 4

export function createMidiPlayer(
  voices: readonly PlayerVoice[],
  clock: Clock = systemClock,
): MidiPlayer {
  /* One ordered list rather than a cursor per part: what matters is what is due
     next across the whole file, and a stable sort keeps a note off ahead of the
     note on that shares its moment, which is what stops a repeated note being
     cut off by its own predecessor. */
  const cues: Cue[] = voices
    .flatMap((voice) => voice.messages.map((message) => ({ at: message.at, voice, data: message.data })))
    .map((cue, index) => ({ cue, index }))
    .sort((a, b) => a.cue.at - b.cue.at || a.index - b.index)
    .map(({ cue }) => cue)

  const listeners = new Set<() => void>()
  let state: PlayerState = { playing: false, at: 0 }
  let cursor = 0
  let startedAt = 0
  let rate = 1
  let timer: number | null = null

  const announce = () => {
    for (const listener of listeners) listener()
  }

  const set = (next: PlayerState) => {
    state = next
    announce()
  }

  const silence = () => {
    for (const voice of voices) voice.instrument.allOff()
  }

  /* Null rather than a set of every channel, so a player nobody has spoken to
     plays the whole file. */
  let heard: ReadonlySet<number> | null = null
  const audible = (channel: number) => heard === null || heard.has(channel)

  const deliver = (cue: Cue) => {
    const event = readMidi(cue.data)
    if (!event) return
    /* Only the notes are held back. A note off reaching a channel that has just
       been muted is what stops it sounding again when it is heard once more. */
    if (event.kind === 'noteOn') {
      if (audible(cue.voice.channel)) cue.voice.instrument.noteOn(event.key)
    } else if (event.kind === 'noteOff') cue.voice.instrument.noteOff(event.key)
    else if (event.kind === 'allOff') cue.voice.instrument.allOff()
    /* bend and mod move panel controls, which a file is not playing. */
  }

  const tick = () => {
    const elapsed = (clock.now() - startedAt) * rate

    while (cursor < cues.length && cues[cursor]!.at <= elapsed) {
      deliver(cues[cursor]!)
      cursor += 1
    }

    if (cursor >= cues.length) {
      silence()
      timer = null
      set({ playing: false, at: elapsed })
      return
    }

    state = { playing: true, at: elapsed }
    announce()
    timer = clock.after(TICK_MS, tick)
  }

  return {
    play(next = 1) {
      if (state.playing) return
      rate = next > 0 ? next : 1
      cursor = 0
      startedAt = clock.now()
      set({ playing: true, at: 0 })
      tick()
    },

    hear(channels) {
      for (const voice of voices) {
        if (audible(voice.channel) && !channels.has(voice.channel)) voice.instrument.allOff()
      }
      heard = channels
    },

    stop() {
      if (timer !== null) clock.cancel(timer)
      timer = null
      silence()
      set({ playing: false, at: 0 })
    },

    snapshot: () => state,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
