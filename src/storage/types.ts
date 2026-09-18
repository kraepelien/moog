import type { Tag, TagInUse } from '@admin/tags.ts'
import type { AdminUser } from '@admin/users.ts'
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
   would make paginating this expensive later.

   One store for every patch, factory or saved. A factory one is addressed by
   its slug instead of a uid and `save` is refused on it, which is the whole of
   the difference — a second store would have been a second vocabulary for it. */
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

/* The categories an admin keeps, apart from PatchStore because they are not a
   patch and outlive any one of them. A patch stores the name as a plain string,
   so this list says what may be offered, never what a patch means. */
export interface TagStore {
  /* Rows rather than names: the save form offers the names and every chip in
     the app is drawn in whatever colour the row carries. */
  listTags(): Promise<readonly Tag[]>
}

/* Refused with `forbidden` for anyone the server does not count as an admin,
   so the page hiding these is a convenience and never the check. */
export interface AdminStore {
  listTagsInUse(): Promise<readonly TagInUse[]>
  addTag(name: string): Promise<void>
  /* Null puts the tag back on the hash, which is the only way to undo one:
     there is no empty hex. */
  setTagColour(id: number, colour: string | null): Promise<void>
  removeTag(id: number): Promise<void>
}

/* Everyone with an account, and what they may do. One privilege at a time
   rather than a whole set: a set write would delete an override row naming a
   privilege this build does not know, and a silently deleted revoke is somebody
   getting access back. */
export interface UserStore {
  listUsers(): Promise<readonly AdminUser[]>
  setUserRoles(uid: string, roles: readonly string[]): Promise<AdminUser>
  setUserPrivilege(uid: string, privilege: string, granted: boolean): Promise<AdminUser>
  /* Back to whatever the roles say. */
  clearUserPrivilege(uid: string, privilege: string): Promise<AdminUser>
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
