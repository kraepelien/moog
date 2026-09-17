import {
  arrangementNameProblem,
  fromBase64,
  readChannels,
  readParts,
  type Arrangement,
} from '@components/midi/arrangement.ts'
import type { Limits } from '@server/limits.ts'
import { isSafeName, type Located } from '@server/repositories/patches.ts'
import type { ArrangementWrite } from '@server/repositories/arrangements.ts'
import type { Repositories } from '@server/repositories/index.ts'
import type { Viewer } from './access.ts'
import type { Identity } from './patches.ts'
import type { Refusal } from './refusal.ts'

/* What may be saved, and what an arrangement is allowed to point at.

   A part naming a patch the owner cannot read is dropped rather than refused:
   the sounds are a reference, and one that has gone is a silent part, which is
   the same thing that happens when a patch is deleted after the fact. Refusing
   the whole save would make one missing sound cost the other fifteen. */

/* The same question the library answers: mine, published, or from the bank.
   Saving an arrangement must not become a way to keep hold of a patch that was
   only ever visible for a moment. */
function canHear(found: Located, viewer: Viewer): boolean {
  return found.slug !== null || found.ownerId === viewer.user.id || found.visibility === 'public'
}

export function createArrangementService(
  repositories: Repositories,
  limits: Limits,
  identity: Identity,
) {
  const { arrangements, patches } = repositories

  /* Decoded here rather than at the route: it is the one field whose size the
     limit is about, and base64 hides that until it is bytes. */
  const readMidi = (value: unknown): Uint8Array | Refusal => {
    if (typeof value !== 'string' || value.length === 0) {
      return { error: 'that arrangement carries no MIDI file', status: 400 }
    }
    let bytes: Uint8Array
    try {
      bytes = fromBase64(value)
    } catch {
      return { error: 'that MIDI file did not decode', status: 400 }
    }
    if (bytes.length > limits.maxMidiBytes) {
      return {
        error: `That file is ${bytes.length} bytes, and the limit is ${limits.maxMidiBytes}.`,
        status: 413,
      }
    }
    return bytes
  }

  const keepable = (parts: ReturnType<typeof readParts>, viewer: Viewer) => {
    const kept: Record<string, { patchId: string; name: string }> = {}
    for (const [channel, part] of Object.entries(parts)) {
      if (!isSafeName(part.patchId)) continue
      const found = patches.locate(part.patchId)
      if (!found || found.deletedAt !== null) continue
      if (!canHear(found, viewer)) continue
      kept[channel] = part
    }
    return kept
  }

  const service = {
    read(payload: unknown, viewer: Viewer): ArrangementWrite | Refusal {
      const given = payload as Partial<Record<string, unknown>> | null
      if (given === null || typeof given !== 'object') {
        return { error: 'invalid body', status: 400 }
      }

      const name = typeof given.name === 'string' ? given.name.trim() : ''
      const problem = arrangementNameProblem(name)
      if (problem !== null) return { error: problem, status: 400 }

      const midi = readMidi(given.midi)
      if (!(midi instanceof Uint8Array)) return midi

      return {
        name,
        fileName: typeof given.fileName === 'string' ? given.fileName : name,
        midi,
        /* Kept as what was typed, like the page holds it: the tempo field
           belongs to the person until it parses. */
        bpm: typeof given.bpm === 'string' ? given.bpm : '',
        parts: keepable(readParts(given.parts), viewer),
        soloed: readChannels(given.soloed),
        muted: readChannels(given.muted),
      }
    },

    create(payload: unknown, viewer: Viewer): Arrangement | Refusal {
      if (arrangements.countOwnedBy(viewer.user.id) >= limits.maxArrangements) {
        return {
          error: `You have ${limits.maxArrangements} arrangements, which is as many as this install keeps.`,
          status: 413,
        }
      }

      const write = service.read(payload, viewer)
      if (!('midi' in write)) return write

      return arrangements.create(identity.newId(), viewer.user.id, write, identity.now())
    },

    replace(uid: string, payload: unknown, viewer: Viewer): Arrangement | Refusal {
      if (!isSafeName(uid)) return { error: 'invalid id', status: 400 }

      const write = service.read(payload, viewer)
      if (!('midi' in write)) return write

      const saved = arrangements.replace(uid, viewer.user.id, write, identity.now())
      return saved ?? { error: 'not found', status: 404 }
    },

    get(uid: string, viewer: Viewer): Arrangement | Refusal {
      if (!isSafeName(uid)) return { error: 'invalid id', status: 400 }
      return arrangements.get(uid, viewer.user.id) ?? { error: 'not found', status: 404 }
    },

    remove(uid: string, viewer: Viewer): true | Refusal {
      if (!isSafeName(uid)) return { error: 'invalid id', status: 400 }
      return arrangements.delete(uid, viewer.user.id) || { error: 'not found', status: 404 }
    },
  }

  return service
}

export type ArrangementService = ReturnType<typeof createArrangementService>
