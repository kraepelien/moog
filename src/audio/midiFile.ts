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

/* One channel's worth of a file, which is what a person picks a sound for. A
   file is written in tracks, but a track is a scribe's unit — several may write
   to one channel, and one may write to several. What decides which notes belong
   together is the channel they are addressed to. */
export interface MidiChannel {
  /* 1 to 16, as a person counts them and as every sequencer prints them, rather
     than the 0 to 15 the file writes. */
  readonly channel: number
  /* The name of the track that wrote these notes, where it gave one. Many files
     name nothing at all. */
  readonly name: string | null
  /* Notes struck, not messages: what tells a part with something in it from one
     carrying only a wheel or a stray controller. */
  readonly notes: number
  readonly messages: readonly TimedMessage[]
}

export interface MidiFile {
  readonly messages: readonly TimedMessage[]
  readonly seconds: number
  /* The tempo the file opens at. Shown so it can be corrected: a file written
     against a tempo it does not state, or stating one nobody honoured, plays at
     the wrong speed and there is nothing in the notes to say so. */
  readonly bpm: number
  /* How many times it changes tempo afterwards. A file that changes is not
     described by one number, and overriding it scales the whole shape rather
     than flattening it. */
  readonly tempoChanges: number
  /* Only channels that strike a note, in channel order. A file's text — its
     title, who wrote it, their email — is written in tracks of its own that
     address no channel, and none of those is a part to be played. */
  readonly channels: readonly MidiChannel[]
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

/* What a track says about itself, which the merged event list cannot: its name,
   and which channels it addressed. */
interface TrackVoice {
  name: string | null
  readonly channels: Set<number>
}

function readTrack(
  reader: Reader,
  length: number,
  into: TickEvent[],
  tempos: TempoChange[],
): TrackVoice {
  const voice: TrackVoice = { name: null, channels: new Set() }
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
      } else if (type === 0x03 || type === 0x04) {
        /* Track name, or the instrument name where a file gives one instead.
           Whichever arrives first is kept: a second is a rename of something
           already named, and the first is what the part was called. */
        const text = reader.text(size).trim()
        if (voice.name === null && text !== '') voice.name = text
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
      voice.channels.add(status & 0x0f)
    }
  }
  reader.at = end
  return voice
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
  const voices: TrackVoice[] = []
  for (let track = 0; track < trackCount && reader.at < bytes.length; track += 1) {
    const name = reader.text(4)
    const size = reader.number(4)
    if (name !== 'MTrk') {
      reader.at += size
      continue
    }
    voices.push(readTrack(reader, size, events, tempos))
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

  /* The one in force at the first tick, which is what a sequencer shows. A file
     that never says gets the specification's own default. */
  const opening = tempoMap.find((change) => change.tick === 0)?.microsecondsPerQuarter ?? DEFAULT_TEMPO

  return {
    messages,
    seconds: messages.length === 0 ? 0 : messages[messages.length - 1]!.at,
    bpm: Math.round((60000000 / opening) * 100) / 100,
    tempoChanges: Math.max(0, tempoMap.length - (tempoMap.some((c) => c.tick === 0) ? 1 : 0)),
    channels: channelsOf(messages, voices),
  }
}

/* Grouped after the merge rather than during it, so a channel's notes carry the
   same times as the file as a whole and there is one tempo map, not one per
   part. */
function channelsOf(
  messages: readonly TimedMessage[],
  voices: readonly TrackVoice[],
): MidiChannel[] {
  const byChannel = new Map<number, TimedMessage[]>()
  const struck = new Map<number, number>()

  for (const message of messages) {
    const channel = message.data[0]! & 0x0f
    const held = byChannel.get(channel)
    if (held) held.push(message)
    else byChannel.set(channel, [message])

    /* A note on at no velocity is a note off written the short way, and is not
       a note struck. */
    if ((message.data[0]! & 0xf0) === 0x90 && (message.data[2] ?? 0) > 0) {
      struck.set(channel, (struck.get(channel) ?? 0) + 1)
    }
  }

  return [...byChannel.entries()]
    .filter(([channel]) => (struck.get(channel) ?? 0) > 0)
    .sort(([a], [b]) => a - b)
    .map(([channel, held]) => ({
      channel: channel + 1,
      /* The first track that addressed this channel and had a name. Where two
         tracks share a channel the earlier one names it, which is the one a
         sequencer lists first. */
      name: voices.find((voice) => voice.channels.has(channel) && voice.name !== null)?.name ?? null,
      notes: struck.get(channel) ?? 0,
      messages: held,
    }))
}
