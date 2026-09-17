import { describe, expect, test } from 'bun:test'
import { createMidiPlayer, type Clock, type PlayerVoice } from '../src/audio/midiPlayer.ts'
import type { Synth, SynthState } from '../src/audio/engine.ts'
import { LOWEST_MIDI } from '../src/audio/notes.ts'

/* Driven with a clock that only moves when the test says so, so a minute of
   music is a handful of ticks and nothing waits. */

function fakeClock() {
  let seconds = 0
  let pending: (() => void) | null = null
  const clock: Clock = {
    now: () => seconds,
    after: (_ms, run) => {
      pending = run
      return 1
    },
    cancel: () => {
      pending = null
    },
  }
  return {
    clock,
    /* Moving time and then letting the player look is what really happens; the
       player never sees the steps in between. */
    advance(to: number) {
      seconds = to
      const run = pending
      pending = null
      run?.()
    },
  }
}

interface Played {
  readonly kind: 'on' | 'off' | 'allOff'
  readonly key?: number
}

function fakeSynth(): Synth & { played: Played[] } {
  const played: Played[] = []
  return {
    played,
    noteOn: (key) => played.push({ kind: 'on', key }),
    noteOff: (key) => played.push({ kind: 'off', key }),
    allOff: () => played.push({ kind: 'allOff' }),
    apply: () => {},
    snapshot: (): SynthState => ({ held: [], sounding: null, running: true }),
    subscribe: () => () => {},
    close: () => {},
  }
}

/* Middle of the instrument's range, so nothing is dropped for being off the
   keyboard. */
const NOTE = LOWEST_MIDI + 12

const on = (channel: number, note = NOTE) => [0x90 | channel, note, 100]
const off = (channel: number, note = NOTE) => [0x80 | channel, note, 0]

/* What was struck and released, without the sweep the player makes when the
   file ends — which has its own tests below. */
const notesOf = (instrument: { played: Played[] }) =>
  instrument.played.filter((event) => event.kind !== 'allOff')

function voice(channel: number, messages: { at: number; data: number[] }[]) {
  const instrument = fakeSynth()
  const made: PlayerVoice = { channel, instrument, messages }
  return { instrument, made }
}

describe('playing a file', () => {
  test('a note sounds when its moment arrives and not before', () => {
    const { clock, advance } = fakeClock()
    const one = voice(0, [{ at: 1, data: on(0) }])
    const player = createMidiPlayer([one.made], clock)

    player.play()
    expect(one.instrument.played).toEqual([])

    advance(0.5)
    expect(one.instrument.played).toEqual([])

    advance(1)
    expect(notesOf(one.instrument)).toEqual([{ kind: 'on', key: 12 }])
  })

  test('each channel plays its own instrument', () => {
    const { clock, advance } = fakeClock()
    const lead = voice(0, [{ at: 0, data: on(0) }])
    const bass = voice(2, [{ at: 0, data: on(2, NOTE + 5) }])
    const player = createMidiPlayer([lead.made, bass.made], clock)

    player.play()
    advance(0.01)

    expect(notesOf(lead.instrument)).toEqual([{ kind: 'on', key: 12 }])
    expect(notesOf(bass.instrument)).toEqual([{ kind: 'on', key: 17 }])
  })

  /* A note on at no velocity is how most files write a note off. */
  test('a note on without velocity releases rather than strikes', () => {
    const { clock, advance } = fakeClock()
    const one = voice(0, [{ at: 0, data: [0x90, NOTE, 0] }])
    createMidiPlayer([one.made], clock).play()
    advance(0.01)
    expect(notesOf(one.instrument)).toEqual([{ kind: 'off', key: 12 }])
  })

  test('everything due at once goes at once, in the order written', () => {
    const { clock, advance } = fakeClock()
    const one = voice(0, [
      { at: 1, data: off(0) },
      { at: 1, data: on(0) },
    ])
    createMidiPlayer([one.made], clock).play()
    advance(1)
    expect(notesOf(one.instrument)).toEqual([
      { kind: 'off', key: 12 },
      { kind: 'on', key: 12 },
    ])
  })
})

describe('the tempo it is played at', () => {
  test('a rate above one brings every note forward', () => {
    const { clock, advance } = fakeClock()
    const one = voice(0, [{ at: 2, data: on(0) }])
    const player = createMidiPlayer([one.made], clock)

    player.play(2)
    advance(0.9)
    expect(one.instrument.played).toEqual([])

    advance(1)
    expect(notesOf(one.instrument)).toHaveLength(1)
  })

  test('a rate below one holds it back', () => {
    const { clock, advance } = fakeClock()
    const one = voice(0, [{ at: 1, data: on(0) }])
    const player = createMidiPlayer([one.made], clock)

    player.play(0.5)
    advance(1.5)
    expect(one.instrument.played).toEqual([])

    advance(2)
    expect(notesOf(one.instrument)).toHaveLength(1)
  })

  /* The position reported is where you are in the piece, not how long you have
     been listening, or a progress bar would disagree with the tempo box. */
  test('the position is in the file, whatever the rate', () => {
    const { clock, advance } = fakeClock()
    const one = voice(0, [{ at: 10, data: on(0) }])
    const player = createMidiPlayer([one.made], clock)

    player.play(2)
    advance(1)
    expect(player.snapshot().at).toBeCloseTo(2, 5)
  })
})

describe('stopping', () => {
  test('stop silences every part, including ones that never played', () => {
    const { clock, advance } = fakeClock()
    const lead = voice(0, [{ at: 0, data: on(0) }])
    const quiet = voice(4, [{ at: 99, data: on(4) }])
    const player = createMidiPlayer([lead.made, quiet.made], clock)

    player.play()
    advance(0.01)
    player.stop()

    expect(lead.instrument.played.at(-1)).toEqual({ kind: 'allOff' })
    expect(quiet.instrument.played).toEqual([{ kind: 'allOff' }])
    expect(player.snapshot().playing).toBe(false)
  })

  test('nothing sounds after stopping', () => {
    const { clock, advance } = fakeClock()
    const one = voice(0, [{ at: 5, data: on(0) }])
    const player = createMidiPlayer([one.made], clock)

    player.play()
    player.stop()
    advance(10)

    expect(notesOf(one.instrument)).toEqual([])
  })

  /* A held note at the end of a file would otherwise sound for ever: a file is
     not obliged to release what it struck. */
  test('reaching the end silences and reports itself finished', () => {
    const { clock, advance } = fakeClock()
    const one = voice(0, [{ at: 1, data: on(0) }])
    const player = createMidiPlayer([one.made], clock)

    player.play()
    advance(1)

    expect(one.instrument.played.at(-1)).toEqual({ kind: 'allOff' })
    expect(player.snapshot().playing).toBe(false)
  })

  test('playing twice over does not start a second run', () => {
    const { clock, advance } = fakeClock()
    const one = voice(0, [{ at: 1, data: on(0) }])
    const player = createMidiPlayer([one.made], clock)

    player.play()
    player.play()
    advance(1)

    expect(notesOf(one.instrument)).toHaveLength(1)
  })
})
