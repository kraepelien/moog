import { z } from 'zod'
import type { ControlValue } from '../controls/types.ts'
import type { FactoryPreset } from './factory.ts'

/* The shipped bank lives in the app bundle and cannot be written to, so
   overwriting or deleting a preset stores an override that shadows it instead.

   That is not a workaround, it is the better model: the original is always still
   there, so every edit and every deletion can be undone, and an app update still
   carries a corrected factory value to anyone who has not overridden it. */

export const presetOverrideSchema = z.object({
  slug: z.string().min(1),
  /* A tombstone. The preset stays in the bundle and stops being offered. */
  deleted: z.boolean().optional(),
  name: z.string().optional(),
  notes: z.string().optional(),
  values: z.record(z.string(), z.unknown()).optional(),
  updatedAt: z.string(),
})

export type PresetOverride = z.infer<typeof presetOverrideSchema>

export interface EffectivePreset extends FactoryPreset {
  /* True when what you are looking at is not what shipped. */
  readonly overridden: boolean
}

/* The bank as it should be offered: shipped presets, with any override applied
   and any tombstoned one left out.

   An override whose slug is not in the bundle is ignored rather than shown. It
   means the preset it shadowed has since been removed from the app, and
   resurrecting it as a phantom entry with no shipped original behind it would
   make "revert to factory" meaningless. */
export function effectivePresets(
  shipped: readonly FactoryPreset[],
  overrides: readonly PresetOverride[],
): readonly EffectivePreset[] {
  const bySlug = new Map(overrides.map((override) => [override.slug, override]))

  const out: EffectivePreset[] = []
  for (const preset of shipped) {
    const override = bySlug.get(preset.slug)
    if (!override) {
      out.push({ ...preset, overridden: false })
      continue
    }
    if (override.deleted) continue
    out.push({
      ...preset,
      name: override.name ?? preset.name,
      notes: override.notes ?? preset.notes,
      values: (override.values ?? preset.values) as Readonly<Record<string, ControlValue>>,
      /* An edited preset is no longer the reconstruction that shipped, so the
         caveat that came with it no longer applies to what you are hearing. */
      approximate: override.values ? undefined : preset.approximate,
      overridden: true,
    })
  }
  return out
}

export function isOverridden(overrides: readonly PresetOverride[], slug: string): boolean {
  return overrides.some((override) => override.slug === slug)
}
