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
  readonly trouble: string | null
  readonly chosen: Readonly<Record<number, Chosen>>
  /* What was typed rather than a number: the field belongs to the person until
     it parses, and a half-typed tempo has not parsed yet. */
  readonly bpm: string
  readonly playing: boolean
}

const EMPTY: MidiSession = {
  file: null,
  fileName: '',
  trouble: null,
  chosen: {},
  bpm: '',
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

export function stopMidi(): void {
  player?.stop()
  player = null
  silenceVoices()
  set({ playing: false })
}

export function holdMidiFile(file: MidiFile, fileName: string): void {
  stopMidi()
  set({
    file,
    fileName,
    chosen: {},
    bpm: String(file.bpm),
    trouble: file.channels.length === 0 ? 'That file has no notes in it.' : null,
  })
}

export function holdMidiTrouble(fileName: string, trouble: string): void {
  stopMidi()
  set({ file: null, fileName, chosen: {}, trouble })
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
