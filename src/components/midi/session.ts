import { useSyncExternalStore } from 'react'
import type { MidiChannel, MidiFile } from '../../audio/midiFile.ts'
import { createMidiPlayer, type MidiPlayer, type PlayerVoice } from '../../audio/midiPlayer.ts'
import { settingsFrom } from '../../audio/settings.ts'
import { silenceVoices, voiceFor } from '../../audio/voices.ts'
import { panelRegistry } from '../../controls/panel.ts'
import { resolvePatch } from '../../patch/resolve.ts'
import type { Patch } from '../../patch/schema.ts'

/* What is loaded to be played, kept outside React.
 *
 * The page is a tab, and a tab that unmounts takes its state with it. A file,
 * the sound chosen for each of its parts and a corrected tempo are minutes of
 * work that one mis-aimed click on another tab was throwing away, so they live
 * here instead. The player lives here for the same reason: leaving the page is
 * only harmless if what is playing keeps playing.
 */

export interface Chosen {
  readonly entryId: string
  readonly name: string
  readonly patch: Patch
}

export interface MidiSession {
  readonly file: MidiFile | null
  readonly fileName: string
  /* The bytes as they arrived. Kept beside the parsed file because saving has
     to store what was uploaded and nothing here can write a MIDI file back
     out — the parser is one way. */
  readonly bytes: Uint8Array | null
  /* What the arrangement is called, and the id the server has it under once it
     has one. Saving writes over that id and creates without it, which is the
     rule the patch editor already follows. */
  readonly name: string
  readonly storedId: string | null
  readonly trouble: string | null
  readonly chosen: Readonly<Record<number, Chosen>>
  /* What was typed rather than a number: the field belongs to the person until
     it parses, and a half-typed tempo has not parsed yet. */
  readonly bpm: string
  /* The desk's two switches, per channel, held as what has been pressed rather
     than as what can be heard — which parts sound is worked out from both at
     once, and a part silenced by somebody else's solo has had nothing pressed
     on it. */
  readonly soloed: ReadonlySet<number>
  readonly muted: ReadonlySet<number>
  readonly playing: boolean
}

const EMPTY: MidiSession = {
  file: null,
  fileName: '',
  bytes: null,
  name: '',
  storedId: null,
  trouble: null,
  chosen: {},
  bpm: '',
  soloed: new Set(),
  muted: new Set(),
  playing: false,
}

let held: MidiSession = EMPTY
let player: MidiPlayer | null = null
const listeners = new Set<() => void>()

function announce(): void {
  for (const listener of listeners) listener()
}

function set(next: Partial<MidiSession>): void {
  held = { ...held, ...next }
  announce()
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

const read = (): MidiSession => held

export function useMidiSession(): MidiSession {
  return useSyncExternalStore(subscribe, read, () => EMPTY)
}

/* Only the parts that have been given a sound: one with none stays silent
   rather than being handed a default. */
export function dressedParts(session: MidiSession): readonly MidiChannel[] {
  return (session.file?.channels ?? []).filter((part) => session.chosen[part.channel] !== undefined)
}

/* What will actually be heard, as a desk decides it: mute wins over solo, on
   the same part and everywhere else, so a part that is both is silent. One solo
   anywhere quietens every part that is not soloed, which is the whole point of
   the button — it is pressed to hear one thing, not to make one thing louder. */
export function audibleParts(session: MidiSession): readonly MidiChannel[] {
  const soloing = session.soloed.size > 0
  return dressedParts(session).filter(
    (part) =>
      !session.muted.has(part.channel) && (!soloing || session.soloed.has(part.channel)),
  )
}

export function isAudible(session: MidiSession, channel: number): boolean {
  return audibleParts(session).some((part) => part.channel === channel)
}

function toggled(held: ReadonlySet<number>, channel: number): ReadonlySet<number> {
  const next = new Set(held)
  if (!next.delete(channel)) next.add(channel)
  return next
}

/* The player is told rather than rebuilt: these are pressed while a file is
   playing, and rebuilding would start it again from the top. */
function retell(): void {
  player?.hear(new Set(audibleParts(held).map((part) => part.channel)))
}

export function toggleSolo(channel: number): void {
  set({ soloed: toggled(held.soloed, channel) })
  retell()
}

export function toggleMute(channel: number): void {
  set({ muted: toggled(held.muted, channel) })
  retell()
}

export function stopMidi(): void {
  player?.stop()
  player = null
  silenceVoices()
  set({ playing: false })
}

export function holdMidiFile(file: MidiFile, fileName: string, bytes: Uint8Array): void {
  stopMidi()
  set({
    file,
    fileName,
    bytes,
    /* Named after the file until somebody says otherwise, which is the name
       they would have typed anyway. */
    name: fileName,
    /* A fresh upload is not the arrangement that was open, even if one was:
       saving it has to create rather than write over what it replaced. */
    storedId: null,
    chosen: {},
    soloed: new Set(),
    muted: new Set(),
    bpm: String(file.bpm),
    trouble: file.channels.length === 0 ? 'That file has no notes in it.' : null,
  })
}

export function holdMidiTrouble(fileName: string, trouble: string): void {
  stopMidi()
  set({
    file: null,
    fileName,
    bytes: null,
    name: '',
    storedId: null,
    chosen: {},
    soloed: new Set(),
    muted: new Set(),
    trouble,
  })
}

/* A saved arrangement put back on the desk. The sounds are fetched by whoever
   calls this, because a part points at a patch and only the page has a store to
   look one up in — a part whose patch has gone is simply left undressed. */
export function holdArrangement(
  arrangement: { id: string; name: string; fileName: string; bpm: string },
  file: MidiFile,
  bytes: Uint8Array,
  sounds: Readonly<Record<number, Chosen>>,
  soloed: readonly number[],
  muted: readonly number[],
): void {
  stopMidi()
  set({
    file,
    fileName: arrangement.fileName,
    bytes,
    name: arrangement.name,
    storedId: arrangement.id,
    chosen: { ...sounds },
    soloed: new Set(soloed),
    muted: new Set(muted),
    bpm: arrangement.bpm || String(file.bpm),
    trouble: null,
  })
}

/* After a save: the same desk, now with somewhere to be written back to. */
export function markArrangementStored(id: string, name: string): void {
  set({ storedId: id, name })
}

export function renameArrangement(name: string): void {
  set({ name })
}

export function chooseSound(channel: number, choice: Chosen): void {
  set({ chosen: { ...held.chosen, [channel]: choice } })
}

export function setTempo(bpm: string): void {
  set({ bpm })
}

/* The file's own tempo is what its seconds were worked out against, so playing
   it at another one is a ratio rather than a rewrite. */
function rateFor(session: MidiSession): number {
  const wanted = Number(session.bpm)
  if (!session.file || !Number.isFinite(wanted) || wanted <= 0) return 1
  return wanted / session.file.bpm
}

export function playMidi(): void {
  const parts = dressedParts(held)
  if (parts.length === 0) return

  const voices: PlayerVoice[] = parts.map((part) => {
    const instrument = voiceFor(part.channel)
    /* Resolved rather than raw: a patch need not carry every control, and the
       ones it leaves out are the registry's defaults, which is what the panel
       would be showing. */
    const resolved = resolvePatch(panelRegistry, held.chosen[part.channel]!.patch)
    instrument.apply(settingsFrom(resolved.values))
    return { channel: part.channel, instrument, messages: part.messages }
  })

  const made = createMidiPlayer(voices)
  player = made
  made.subscribe(() => set({ playing: made.snapshot().playing }))
  /* Every dressed part is given a voice and the quiet ones are held back rather
     than left out, so pressing solo mid-file brings a part in instead of asking
     for a player that does not have it. */
  retell()
  made.play(rateFor(held))
  set({ playing: true })
}

/* Tests share this module across cases, which would otherwise inherit a file
   and a player from whichever ran first. */
export function forgetMidiSession(): void {
  stopMidi()
  held = EMPTY
  announce()
}
