import type { Patch } from '../patch/schema.ts'

export interface PatchSummary {
  readonly id: string
  readonly name: string
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
export interface PresetStore {
  listPresets(): Promise<readonly Patch[]>
}
