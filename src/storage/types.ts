import type { TagInUse } from '@admin/tags.ts'
import type { LibraryEntry } from '@components/library/entry.ts'
import type {
  Arrangement,
  ArrangementInput,
  ArrangementSummary,
} from '@components/midi/arrangement.ts'
import type { Patch, Visibility } from '@patch/schema.ts'

export interface PatchSummary {
  readonly id: string
  readonly name: string
  /* What the library groups and filters by. Metadata rather than values: three
     short fields that let a list of patches be drawn without fetching each one,
     where pulling `values` in would be what makes paginating expensive. */
  readonly tags: readonly string[]
  readonly instrument: string
  readonly visibility: Visibility
  readonly createdAt: string
  readonly updatedAt: string
}

/* `unauthenticated` and `forbidden` are apart from `io` because they are the
   only failures a person can act on. */
export type StoreErrorKind =
  | 'unavailable'
  | 'unauthenticated'
  | 'forbidden'
  | 'quota'
  | 'corrupt'
  | 'io'

/* Backend failures are translated into this before they leave an adapter, so no
   call site ever sees a DOMException or has to know what threw. */
export class StoreError extends Error {
  readonly kind: StoreErrorKind

  constructor(kind: StoreErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'StoreError'
    this.kind = kind
  }
}

/* Summaries rather than patches: a UI expecting every value up front is what
   would make paginating this expensive later. */
export interface PatchStore {
  list(): Promise<readonly PatchSummary[]>
  get(id: string): Promise<Patch | null>
  /* The server mints the id, so a caller cannot choose one that collides or
     bring back something it deleted. `from` records what this was copied from. */
  create(patch: Patch, from?: string): Promise<Patch>
  /* Returns the stored patch rather than void: a server owns updatedAt, and call
     sites must not assume the local copy won. */
  save(patch: Patch): Promise<Patch>
  delete(id: string): Promise<void>
}

/* Read-only: the bank comes from the image, so saving one is always a copy,
   which is an ordinary patch. Listed whole because it is small. */
/* The categories an admin keeps, apart from PatchStore because they are not a
   patch and outlive any one of them. A patch stores the name as a plain string,
   so this list says what may be offered, never what a patch means. */
export interface TagStore {
  listTags(): Promise<readonly string[]>
}

/* Refused with `forbidden` for anyone the server does not count as an admin,
   so the page hiding these is a convenience and never the check. */
export interface AdminStore {
  listTagsInUse(): Promise<readonly TagInUse[]>
  addTag(name: string): Promise<void>
  removeTag(id: number): Promise<void>
}

export interface PresetStore {
  listPresets(): Promise<readonly Patch[]>
}

/* A MIDI file and the sounds put on its parts. Refused with `forbidden` for
   anyone the server does not grant StoreMidi, so the page hiding the buttons is
   a convenience and never the check. */
export interface ArrangementStore {
  listArrangements(): Promise<readonly ArrangementSummary[]>
  getArrangement(id: string): Promise<Arrangement | null>
  createArrangement(arrangement: ArrangementInput): Promise<Arrangement>
  saveArrangement(id: string, arrangement: ArrangementInput): Promise<Arrangement>
  deleteArrangement(id: string): Promise<void>
}

/* The library in one call: the rows a viewer may see, with their own rating and
   everyone's average already on them. */
export interface LibraryStore {
  library(instrument?: string): Promise<readonly LibraryEntry[]>
  rate(id: string, stars: number): Promise<void>
}
