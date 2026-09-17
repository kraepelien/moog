import { z } from 'zod'
import { migrateToCurrent } from '@patch/migrate.ts'
import { type Patch, type PatchIdentity, systemIdentity } from '@patch/schema.ts'
import { err, ok, type Result } from '@/result.ts'

export const BUNDLE_FORMAT = 'minimoog-patch-bundle'

/* Versions the file wrapper, not the patches inside it. The two move for
   different reasons: adding a field to the envelope is not a control-value
   change, and a bundle can legitimately carry patches of mixed schema version. */
export const BUNDLE_FORMAT_VERSION = 1

export interface PatchBundle {
  readonly format: typeof BUNDLE_FORMAT
  readonly formatVersion: number
  readonly exportedAt: string
  readonly patches: readonly Patch[]
}

/* Always an array, even for one patch. A single patch is the one-element case;
   two file formats would mean two validators and two sets of failure modes. */
export function createBundle(
  patches: readonly Patch[],
  identity: PatchIdentity = systemIdentity,
): PatchBundle {
  return {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    exportedAt: identity.now(),
    patches,
  }
}

export function serializeBundle(bundle: PatchBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`
}

/* `format` is checked by literal, so a file that is not ours is refused by name
   rather than by whatever happens to be missing from it. Patches stay unknown
   here: they are migrated and validated one at a time below. */
const envelopeSchema = z.object({
  format: z.literal(BUNDLE_FORMAT, `is not a Minimoog patch bundle`),
  formatVersion: z.int(),
  patches: z.array(z.unknown()),
})

export interface RejectedPatch {
  readonly index: number
  readonly name: string | null
  readonly reason: string
}

export interface ImportResult {
  readonly patches: readonly Patch[]
  readonly rejected: readonly RejectedPatch[]
}

function describe(entry: unknown): string | null {
  if (typeof entry === 'object' && entry !== null && 'name' in entry) {
    const name = (entry as { name: unknown }).name
    if (typeof name === 'string' && name !== '') return name
  }
  return null
}

/* A malformed envelope fails outright; a malformed patch inside a good envelope
   is reported and skipped, so one bad record does not cost the user the rest of
   the file. Nothing is written by this function — the caller decides. */
export function parseBundle(text: string, identity: PatchIdentity = systemIdentity): Result<ImportResult> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return err(`File is not valid JSON: ${error instanceof Error ? error.message : 'parse failed'}`)
  }

  /* The envelope only. Each patch inside is checked separately, so one bad
     record is reported and skipped rather than failing the whole file. */
  const parsed = envelopeSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path.join('.')
    return err(path ? `Bundle ${path}: ${issue?.message}` : `Bundle ${issue?.message ?? 'is not valid'}`)
  }

  const bundle = parsed.data

  if (bundle.formatVersion > BUNDLE_FORMAT_VERSION) {
    return err(
      `Bundle uses format version ${bundle.formatVersion}, but this build understands up to ${BUNDLE_FORMAT_VERSION}. Update the app to open it.`,
    )
  }

  const patches: Patch[] = []
  const rejected: RejectedPatch[] = []

  bundle.patches.forEach((entry, index) => {
    const migrated = migrateToCurrent(entry)
    if (!migrated.ok) {
      rejected.push({ index, name: describe(entry), reason: migrated.error })
      return
    }
    /* Fresh id and timestamps: importing your own export should add patches, not
       silently overwrite the ones already saved under the same ids. */
    const timestamp = identity.now()
    patches.push({
      ...migrated.value,
      id: identity.newId(),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  })

  return ok({ patches, rejected })
}
