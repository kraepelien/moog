import type { ControlValue } from '../controls/types.ts'
import { createPatch, type Patch, type PatchIdentity, systemIdentity } from '../patch/schema.ts'

/* A factory preset is a patch that came with the app, and that is all it is:
   the same fields, the same validator, the same migrations, kept in the repo
   rather than saved by anyone. It used to be its own type with its own schema,
   which is exactly why presets and patches could not be listed together.

   What is left here is copying, because that is the one thing about a preset
   that is not true of a patch: you can never save over one. */

/* Omitting a control id in a factory file means "whatever the registry defaults
   to" — an omission is honest, a guessed value is not, which is why most of
   the bank carries well under half the panel. */

/* Save as. A copy is a new patch with a new id, owned by whoever made it and
   private until they say otherwise, carrying a record of what it came from.

   The record is a snapshot: the source can be renamed, hidden or deleted, and
   a copy that says "from Sub Bass" is more use afterwards than a pointer that
   resolves to nothing. */
export function copyOf(
  source: Patch,
  options: {
    name?: string
    values?: Readonly<Record<string, ControlValue>>
    owner?: { id: string; name: string | null } | null
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
      /* Not copied: a copy of a public patch is not itself published, and
         inheriting `approximate` would claim someone else's caveat about
         values the copier may have changed. */
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
