import type { Patch } from '../patch/schema.ts'

export interface PatchSummary {
  readonly id: string
  readonly name: string
  readonly createdAt: string
  readonly updatedAt: string
}

export type StoreErrorKind = 'unavailable' | 'quota' | 'corrupt' | 'io'

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

/* list() returns summaries, not patches: a real backend will paginate this, and a
   UI that expects every value up front is the thing that would make that swap
   expensive. If a screen ever needs values for many patches at once, that is the
   leak — add a purpose-built method rather than fattening the summary. */
export interface PatchStore {
  list(): Promise<readonly PatchSummary[]>
  get(id: string): Promise<Patch | null>
  /* Returns the stored patch rather than void: a server owns updatedAt, and call
     sites must not assume the local copy won. */
  save(patch: Patch): Promise<Patch>
  delete(id: string): Promise<void>
}

/* Separate from PatchStore because the working draft has a different lifecycle:
   exactly one, always overwritten, never listed, and plausibly still client-side
   on the day saved patches move to a server. */
export interface DraftStore {
  readDraft(): Promise<Patch | null>
  writeDraft(patch: Patch): Promise<void>
  clearDraft(): Promise<void>
}
