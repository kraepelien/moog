import type { Patch, Visibility } from '../patch/schema.ts'

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
  /* Returns the stored patch rather than void: a server owns updatedAt, and call
     sites must not assume the local copy won. */
  save(patch: Patch): Promise<Patch>
  delete(id: string): Promise<void>
}

/* Still its own interface, but no longer its own type: a factory preset is a
   patch kept in the repo rather than saved by anyone. What is different is
   where it lives and that nobody may write over it, and both of those are the
   store's business rather than the record's.

   Listed whole because the bank is small and the library shows all of it. */
export interface PresetStore {
  listPresets(): Promise<readonly Patch[]>
  savePreset(preset: Patch): Promise<void>
  deletePreset(slug: string): Promise<void>
}
