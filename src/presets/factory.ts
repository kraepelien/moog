import type { ControlValue } from '../controls/types.ts'
import { createPatch, type Patch, type PatchIdentity, systemIdentity } from '../patch/schema.ts'

/* A preset is a patch that shipped with the app. It carries no id or timestamps:
   those belong to a stored patch, and a preset is never stored. Omitting a
   control id means "whatever the registry defaults to" — an omission is honest,
   a guessed value is not. */
export interface FactoryPreset {
  readonly slug: string
  readonly name: string
  readonly notes: string
  readonly values: Readonly<Record<string, ControlValue>>
}

export const factoryPresets: readonly FactoryPreset[] = [
  {
    slug: 'placeholder-one',
    name: 'PLACEHOLDER — Test Tone A',
    notes: 'Not a real Minimoog patch. Placeholder until real preset data arrives.',
    values: {},
  },
  {
    slug: 'placeholder-two',
    name: 'PLACEHOLDER — Test Tone B',
    notes: 'Not a real Minimoog patch. Placeholder until real preset data arrives.',
    values: {},
  },
]

export function findPreset(slug: string): FactoryPreset | undefined {
  return factoryPresets.find((preset) => preset.slug === slug)
}

/* Loading a preset produces a fresh unsaved patch with a new id, so saving after
   loading can never write back over the preset or over the patch last saved. */
export function draftFromPreset(
  preset: FactoryPreset,
  identity: PatchIdentity = systemIdentity,
): Patch {
  return createPatch({ name: preset.name, notes: preset.notes, values: preset.values }, identity)
}
