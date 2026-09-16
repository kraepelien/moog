import { z } from 'zod'
import type { ControlValue } from '../controls/types.ts'
import { createPatch, type Patch, type PatchIdentity, systemIdentity } from '../patch/schema.ts'

/* A preset is a patch that came with the app, kept as a file in the presets
   folder. Omitting a control id means "whatever the registry defaults to" — an
   omission is honest, a guessed value is not, which is why most of these carry
   well under half the panel.

   It has no id or timestamps: those belong to a stored patch, and loading a
   preset makes a new patch rather than adopting the preset itself. */

export const presetSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'must be lower-case letters, digits and dashes'),
  name: z.string().min(1),
  notes: z.string(),
  /* Set when the values are a reconstruction rather than settings read off an
     instrument, so the UI can say so rather than letting them pass for real. */
  approximate: z.boolean().optional(),
  values: z.record(z.string(), z.unknown()),
})

export type StoredPreset = z.infer<typeof presetSchema> & {
  readonly values: Readonly<Record<string, ControlValue>>
}

/* Loading a preset produces a fresh unsaved patch with a new id, so saving after
   loading writes a patch rather than touching the preset. Changing a preset is a
   separate, deliberate act. */
export function draftFromPreset(
  preset: StoredPreset,
  identity: PatchIdentity = systemIdentity,
): Patch {
  return createPatch({ name: preset.name, notes: preset.notes, values: preset.values }, identity)
}

/* What a preset becomes when the panel is written over it. */
export function presetFromDraft(
  slug: string,
  draft: Patch,
  values: Readonly<Record<string, ControlValue>>,
): StoredPreset {
  return { slug, name: draft.name || slug, notes: draft.notes, values }
}
