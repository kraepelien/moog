import { describe, expect, test } from 'bun:test'
import { MidiFileError, readMidiFile } from '@audio/midiFile.ts'
import { readMidi } from '@audio/midi.ts'

/* Files are built here by hand rather than committed as fixtures: a few bytes
   that say exactly what is being tested beat a binary nobody can read in a
   diff. */

const TICKS = 96

const chunk = (name: string, body: number[]): number[] => {
  const size = body.length
  return [
    ...[...name].map((c) => c.charCodeAt(0)),
    (size >> 24) & 0xff,
    (size >> 16) & 0xff,
    (size >> 8) & 0xff,
    size & 0xff,
    ...body,
  ]
}

const file = (tracks: number[][], format = tracks.length > 1 ? 1 : 0): Uint8Array =>
  new Uint8Array([
    ...chunk('MThd', [0, format, 0, tracks.length, (TICKS >> 8) & 0xff, TICKS & 0xff]),
    ...tracks.flatMap((track) => chunk('MTrk', [...track, 0x00, 0xff, 0x2f, 0x00])),
  ])

/* 500000 microseconds a quarter note is 120bpm, so one quarter is half a
   second and the arithmetic in these tests is readable. */
const tempo120 = [0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20]

describe('reading a file', () => {
  test('places notes in seconds, not ticks', () => {
    const { messages, seconds } = readMidiFile(
      file([[...tempo120, 0x00, 0x90, 60, 100, TICKS, 0x80, 60, 0]]),
    )
    expect(messages).toHaveLength(2)
    expect(messages[0]!.at).toBeCloseTo(0, 10)
    expect(messages[1]!.at).toBeCloseTo(0.5, 10)
    expect(seconds).toBeCloseTo(0.5, 10)
  })

  test('reads a tempo change part way through', () => {
    const { messages } = readMidiFile(
      file([
        [
          ...tempo120,
          0x00, 0x90, 60, 100,
          /* Twice as fast from here, so the next quarter takes half as long. */
          TICKS, 0xff, 0x51, 0x03, 0x03, 0xd0, 0x90,
          0x00, 0x90, 62, 100,
          TICKS, 0x80, 62, 0,
        ],
      ]),
    )
    expect(messages[1]!.at).toBeCloseTo(0.5, 10)
    expect(messages[2]!.at).toBeCloseTo(0.75, 10)
  })

  /* A file may leave the status byte off when it repeats. Forgetting that is
     the classic way to read the second half of a file as gibberish. */
  test('follows a running status', () => {
    const { messages } = readMidiFile(
      file([[...tempo120, 0x00, 0x90, 60, 100, 0x00, 62, 100, TICKS, 62, 0]]),
    )
    expect(messages.map((message) => message.data)).toEqual([
      [0x90, 60, 100],
      [0x90, 62, 100],
      [0x90, 62, 0],
    ])
  })

  test('reads a delta time longer than a byte', () => {
    /* 0x81 0x00 is 128 ticks, which is where a naive reader stops early. */
    const { messages } = readMidiFile(
      file([[...tempo120, 0x00, 0x90, 60, 100, 0x81, 0x00, 0x80, 60, 0]]),
    )
    expect(messages[1]!.at).toBeCloseTo((128 / TICKS) * 0.5, 10)
  })

  test('plays tracks together rather than one after another', () => {
    const { messages } = readMidiFile(
      file([
        [...tempo120, 0x00, 0x90, 60, 100, TICKS, 0x80, 60, 0],
        [0x00, 0x90, 67, 100, TICKS, 0x80, 67, 0],
      ]),
    )
    expect(messages.map((message) => message.data[1])).toEqual([60, 67, 60, 67])
    expect(messages[1]!.at).toBeCloseTo(0, 10)
  })

  test('keeps the wheels and drops what the instrument cannot use', () => {
    const { messages } = readMidiFile(
      file([
        [
          ...tempo120,
          0x00, 0xb0, 1, 64,
          0x00, 0xe0, 0x00, 0x40,
          /* A program change asks it to be a different instrument, which it
             cannot be. */
          0x00, 0xc0, 5,
          0x00, 0xff, 0x03, 0x04, 0x6e, 0x61, 0x6d, 0x65,
        ],
      ]),
    )
    expect(messages.map((message) => message.data[0])).toEqual([0xb0, 0xe0])
    /* And what survives is what the instrument already knows how to read. */
    expect(readMidi(messages[0]!.data)).toEqual({ kind: 'mod', fraction: 64 / 127 })
    expect(readMidi(messages[1]!.data)).toEqual({ kind: 'bend', fraction: 0 })
  })
})

describe('a file that is not one', () => {
  test('says so rather than playing silence', () => {
    expect(() => readMidiFile(new Uint8Array([1, 2, 3, 4]))).toThrow(MidiFileError)
    expect(() => readMidiFile(new Uint8Array([]))).toThrow(MidiFileError)
  })

  test('names the formats it cannot read', () => {
    const smpte = new Uint8Array([
      ...chunk('MThd', [0, 0, 0, 1, 0xe7, 0x28]),
      ...chunk('MTrk', [0x00, 0xff, 0x2f, 0x00]),
    ])
    expect(() => readMidiFile(smpte)).toThrow(/SMPTE/)
  })
})

/* A meta event carrying text: 0x03 names the track, 0x04 names the instrument
   it was written for. */
const named = (type: number, text: string): number[] => [
  0x00,
  0xff,
  type,
  text.length,
  ...[...text].map((c) => c.charCodeAt(0)),
]

const note = (channel: number, key: number): number[] => [
  0x00,
  0x90 | channel,
  key,
  100,
  TICKS,
  0x80 | channel,
  key,
  0,
]

describe('the parts a file is in', () => {
  test('a channel becomes a part, named by the track that wrote it', () => {
    const { channels } = readMidiFile(
      file([
        [...tempo120],
        [...named(0x03, 'Bass'), ...note(2, 40)],
        [...named(0x03, 'Lead'), ...note(0, 72)],
      ]),
    )

    expect(channels.map((part) => [part.channel, part.name])).toEqual([
      [1, 'Lead'],
      [3, 'Bass'],
    ])
  })

  /* Channels are counted from one on every sequencer ever made, while the file
     writes them from zero. Showing the file's number would leave every part off
     by one against the thing it was written in. */
  test('channels are numbered as a person counts them', () => {
    const { channels } = readMidiFile(file([[...note(9, 40)]]))
    expect(channels[0]!.channel).toBe(10)
  })

  /* The title, the author and their email are tracks too, and none of them is
     something you can pick a sound for. */
  test('a track that strikes no note is not a part', () => {
    const { channels } = readMidiFile(
      file([
        [...named(0x03, 'Mega Man 1')],
        [...named(0x03, 'By: Someone')],
        [...named(0x03, 'Lead'), ...note(0, 72)],
      ]),
    )
    expect(channels).toHaveLength(1)
    expect(channels[0]!.name).toBe('Lead')
  })

  test('an instrument name is used when there is no track name', () => {
    const { channels } = readMidiFile(file([[...named(0x04, 'Sq. Wave'), ...note(0, 72)]]))
    expect(channels[0]!.name).toBe('Sq. Wave')
  })

  test('a file that names nothing says so rather than inventing a name', () => {
    const { channels } = readMidiFile(file([[...note(0, 72)]]))
    expect(channels[0]!.name).toBeNull()
  })

  test('notes are counted, and a note on at no velocity is not one', () => {
    const { channels } = readMidiFile(
      file([[0x00, 0x90, 60, 100, 0x00, 0x90, 62, 100, TICKS, 0x90, 60, 0]]),
    )
    expect(channels[0]!.notes).toBe(2)
  })

  test('a part carries only its own channel', () => {
    const { channels } = readMidiFile(file([[...note(0, 72)], [...note(3, 40)]]))
    for (const part of channels) {
      for (const message of part.messages) {
        expect((message.data[0]! & 0x0f) + 1).toBe(part.channel)
      }
    }
  })
})

describe('the tempo it says it is', () => {
  test('reports the tempo the file opens at', () => {
    expect(readMidiFile(file([[...tempo120, ...note(0, 60)]])).bpm).toBe(120)
  })

  /* The specification's own default, for a file that never says. */
  test('a file that states no tempo is 120', () => {
    expect(readMidiFile(file([[...note(0, 60)]])).bpm).toBe(120)
  })

  test('counts the changes after the opening one, so a steady file reads zero', () => {
    const steady = readMidiFile(file([[...tempo120, ...note(0, 60)]]))
    expect(steady.tempoChanges).toBe(0)

    const changing = readMidiFile(
      file([[...tempo120, ...note(0, 60), 0x00, 0xff, 0x51, 0x03, 0x03, 0xd0, 0x90]]),
    )
    expect(changing.tempoChanges).toBe(1)
  })
})
