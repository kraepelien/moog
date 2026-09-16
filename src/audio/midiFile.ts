/* Reading a Standard MIDI File into something playable.
 *
 * This is not part of the instrument. A Model D has no sequencer, and nothing
 * here belongs on its panel: a file is a way of playing the keys, like a hand
 * or a controller, and it reaches the instrument the same way they do. It lives
 * in src/ rather than beside the tool that uses it because a parser is worth
 * testing, and a page is not easy to test.
 *
 * What a file carries and this keeps: notes, the two wheels, and the tempo
 * changes needed to place them in seconds. What it drops: instrument names,
 * lyrics, key signatures, program changes and everything else a synthesiser
 * with one sound and one voice has no use for.
 */

export interface TimedMessage {
  /* Seconds from the start of the piece. */
  readonly at: number
  readonly data: readonly number[]
}

export interface MidiFile {
  readonly messages: readonly TimedMessage[]
  readonly seconds: number
}

export class MidiFileError extends Error {}

/* Microseconds per quarter note until a file says otherwise, which is 120bpm.
   The specification's default, not a choice. */
const DEFAULT_TEMPO = 500000

class Reader {
  at = 0
  readonly bytes: Uint8Array

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  byte(): number {
    if (this.at >= this.bytes.length) throw new MidiFileError('the file ends mid-event')
    return this.bytes[this.at++]!
  }

  number(count: number): number {
    let value = 0
    for (let i = 0; i < count; i += 1) value = (value << 8) | this.byte()
    return value
  }

  /* Delta times are base-128, high bit set on every byte but the last, which is
     what lets a long rest cost as little as a short one. */
  variable(): number {
    let value = 0
    for (;;) {
      const byte = this.byte()
      value = (value << 7) | (byte & 0x7f)
      if ((byte & 0x80) === 0) return value
    }
  }

  text(count: number): string {
    let out = ''
    for (let i = 0; i < count; i += 1) out += String.fromCharCode(this.byte())
    return out
  }
}

interface TickEvent {
  readonly tick: number
  readonly data: readonly number[]
}

interface TempoChange {
  readonly tick: number
  readonly microsecondsPerQuarter: number
}

/* How many data bytes follow a status byte. Program change and channel
   pressure carry one; everything else this keeps carries two. */
const dataBytes = (status: number): number =>
  (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2

function readTrack(reader: Reader, length: number, into: TickEvent[], tempos: TempoChange[]): void {
  const end = reader.at + length
  let tick = 0
  /* A file may leave the status byte off when it repeats, which is how a run of
     notes is written compactly. Forgetting it is the classic way to read a file
     as gibberish half way through. */
  let running = 0

  while (reader.at < end) {
    tick += reader.variable()
    let status = reader.byte()
    if (status < 0x80) {
      /* Not a status byte at all, so it is the first data byte of another event
         like the one before. */
      reader.at -= 1
      status = running
    } else if (status < 0xf0) {
      running = status
    }

    if (status === 0xff) {
      const type = reader.byte()
      const size = reader.variable()
      if (type === 0x51 && size === 3) {
        tempos.push({ tick, microsecondsPerQuarter: reader.number(3) })
      } else {
        reader.at += size
      }
      continue
    }

    if (status === 0xf0 || status === 0xf7) {
      reader.at += reader.variable()
      continue
    }

    const data = [status]
    for (let i = 0; i < dataBytes(status); i += 1) data.push(reader.byte())
    const kind = status & 0xf0
    /* Notes, the wheels and the controllers. A program change would only ask
       this instrument to be a different one, which it cannot be. */
    if (kind === 0x80 || kind === 0x90 || kind === 0xb0 || kind === 0xe0) {
      into.push({ tick, data })
    }
  }
  reader.at = end
}

export function readMidiFile(bytes: Uint8Array): MidiFile {
  const reader = new Reader(bytes)
  if (reader.text(4) !== 'MThd') throw new MidiFileError('not a MIDI file')
  const headerSize = reader.number(4)
  const format = reader.number(2)
  const trackCount = reader.number(2)
  const division = reader.number(2)
  reader.at += headerSize - 6

  if (format > 1) throw new MidiFileError(`this reads format 0 and 1, and the file is ${format}`)
  if (division & 0x8000) throw new MidiFileError('this reads files timed in ticks, not in SMPTE')
  if (division === 0) throw new MidiFileError('the file says a quarter note is no ticks long')

  const events: TickEvent[] = []
  const tempos: TempoChange[] = []
  for (let track = 0; track < trackCount && reader.at < bytes.length; track += 1) {
    const name = reader.text(4)
    const size = reader.number(4)
    if (name !== 'MTrk') {
      reader.at += size
      continue
    }
    readTrack(reader, size, events, tempos)
  }

  /* Tracks are written side by side and played together, so they are merged by
     when things happen rather than by which track they were written in. A stable
     sort keeps a note off that shares a tick with the next note on ahead of it,
     which is what stops a repeated note being cut by its own predecessor. */
  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.tick - b.event.tick || a.index - b.index)
    .map(({ event }) => event)
  const tempoMap = [...tempos].sort((a, b) => a.tick - b.tick)

  let tempo = DEFAULT_TEMPO
  let lastTick = 0
  let seconds = 0
  let next = 0
  const messages: TimedMessage[] = []
  const advance = (tick: number) => {
    while (next < tempoMap.length && tempoMap[next]!.tick <= tick) {
      const change = tempoMap[next]!
      seconds += ((change.tick - lastTick) * tempo) / division / 1000000
      lastTick = change.tick
      tempo = change.microsecondsPerQuarter
      next += 1
    }
    return seconds + ((tick - lastTick) * tempo) / division / 1000000
  }

  for (const event of ordered) messages.push({ at: advance(event.tick), data: event.data })

  return {
    messages,
    seconds: messages.length === 0 ? 0 : messages[messages.length - 1]!.at,
  }
}
