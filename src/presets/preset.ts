import type { ControlValue } from '../controls/types.ts'
import { createPatch, type Patch, type PatchIdentity, systemIdentity } from '../patch/schema.ts'

/* A factory preset is a patch kept in the repo rather than saved by anyone, so
   copying is the only thing here: you can never save over one.

   `derivedFrom` is a snapshot, not a reference — the source can be renamed or
   deleted, and "from Sub Bass" is more use afterwards than a dangling id. */
export function copyOf(
  source: Patch,
  options: {
    name?: string
    values?: Readonly<Record<string, ControlValue>>
    /* `null` is a factory preset, which has no maker. A maker the library knows
       only by name — a public patch of someone else's — carries a null id: the
       server fills in the real one when the copy is created. */
    owner?: { id: string | null; name: string | null } | null
  } = {},
  identity: PatchIdentity = systemIdentity,
): Patch {
  return createPatch(
    {
      name: options.name ?? source.name,
      notes: source.notes,
      values: options.values ?? source.values,
      tags: source.tags,
      instrument: source.instrument,
      /* Private whatever a saved patch defaults to and whatever the source was:
         republishing somebody else's work under your own name is a choice they
         did not make. `approximate` is likewise not copied — the values may no
         longer be the reconstruction. */
      visibility: 'private',
      derivedFrom: {
        id: source.id,
        name: source.name,
        kind: options.owner === null ? 'factory' : 'user',
        ownerId: options.owner?.id ?? null,
        ownerName: options.owner?.name ?? null,
        at: identity.now(),
      },
    },
    identity,
  )
}
