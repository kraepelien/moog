import { MidiFileError, readMidiFile } from '@audio/midiFile.ts'
import type { Patch } from '@patch/schema.ts'
import {
  asChannel,
  fromBase64,
  toBase64,
  type Arrangement,
  type ArrangementInput,
  type ArrangementPart,
  type ArrangementSummary,
} from './arrangement.ts'
import { holdArrangement, type Chosen, type MidiSession } from './session.ts'

/* Saving the desk and putting it back.

   A narrow port rather than the whole store: this needs five calls, and the
   page that owns a store hands them down the way it already hands down a way to
   load a patch. */
export interface Desk {
  list(): Promise<readonly ArrangementSummary[]>
  get(id: string): Promise<Arrangement | null>
  create(arrangement: ArrangementInput): Promise<Arrangement>
  save(id: string, arrangement: ArrangementInput): Promise<Arrangement>
  remove(id: string): Promise<void>
  /* By id, not by library row: a stored part names a patch and the row it was
     picked from may be long gone from the list on screen. */
  patch(id: string): Promise<Patch | null>
}

/* Null when there is nothing to save, which is the state the button is disabled
   in — belt and braces, so a saved arrangement can never be an empty one. */
export function toInput(session: MidiSession): ArrangementInput | null {
  if (session.bytes === null || session.file === null) return null

  const parts: Record<string, ArrangementPart> = {}
  for (const [channel, chosen] of Object.entries(session.chosen)) {
    parts[channel] = { patchId: chosen.entryId, name: chosen.name }
  }

  return {
    name: session.name.trim(),
    fileName: session.fileName,
    midi: toBase64(session.bytes),
    bpm: session.bpm,
    parts,
    soloed: [...session.soloed],
    muted: [...session.muted],
  }
}

/* What was heard, as far as it can still be heard. A part whose patch has been
   deleted, or unpublished out from under the arrangement, is reported rather
   than dropped in silence: the desk shows it undressed and the caller says
   which sounds have gone. */
export interface Restored {
  readonly missing: readonly string[]
}

export async function openArrangement(desk: Desk, id: string): Promise<Restored> {
  const stored = await desk.get(id)
  if (!stored) throw new MidiFileError('That arrangement is no longer there.')

  const file = readMidiFile(fromBase64(stored.midi))

  const sounds: Record<number, Chosen> = {}
  const missing: string[] = []

  for (const [key, part] of Object.entries(stored.parts)) {
    const channel = asChannel(key)
    if (channel === null) continue

    const patch = await desk.patch(part.patchId)
    if (!patch) {
      missing.push(part.name)
      continue
    }
    sounds[channel] = { entryId: part.patchId, name: patch.name, patch }
  }

  holdArrangement(stored, file, fromBase64(stored.midi), sounds, stored.soloed, stored.muted)
  return { missing }
}
