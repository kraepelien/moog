import { z } from 'zod'
import type { ControlValue } from '../controls/types.ts'
import { createPatch, type Patch, type PatchIdentity, systemIdentity } from '../patch/schema.ts'
import bank from './factory.json'

/* A preset is a patch that shipped with the app. It carries no id or timestamps:
   those belong to a stored patch, and a preset is never stored. Omitting a
   control id means "whatever the registry defaults to" — an omission is honest,
   a guessed value is not, which is why most of these carry well under half the
   panel. */

const presetSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  notes: z.string(),
  /* Set when the values are a reconstruction rather than a transcription, so
     the UI can say so rather than letting them pass as the real settings. */
  approximate: z.boolean().optional(),
  values: z.record(z.string(), z.unknown()),
})

const bankSchema = z
  .array(presetSchema)
  .refine((list) => new Set(list.map((p) => p.slug)).size === list.length, 'slugs must be unique')

export type FactoryPreset = z.infer<typeof presetSchema> & {
  readonly values: Readonly<Record<string, ControlValue>>
}

/* Parsed once at startup: a malformed bank is a build problem, and finding it
   when the module loads beats finding it when somebody clicks a preset. */
const parsed = bankSchema.safeParse(bank)
if (!parsed.success) {
  throw new Error(`Factory preset bank is invalid: ${parsed.error.issues[0]?.message}`)
}

export const factoryPresets: readonly FactoryPreset[] = parsed.data

export function findPreset(slug: string): FactoryPreset | undefined {
  return factoryPresets.find((preset) => preset.slug === slug)
}

/* Loading a preset produces a fresh unsaved patch with a new id, so saving after
   loading can never write back over the preset or over the patch last saved.
   Presets are read-only; what you keep is always a copy. */
export function draftFromPreset(
  preset: FactoryPreset,
  identity: PatchIdentity = systemIdentity,
): Patch {
  return createPatch({ name: preset.name, notes: preset.notes, values: preset.values }, identity)
}
