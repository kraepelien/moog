import { z } from 'zod'
import type { ControlValue } from '../controls/types.ts'
import { err, ok, type Result } from '../result.ts'

/* 2 added the three fields the library sorts and filters on. Bump this with a
   migration in migrate.ts, never on its own: a patch on disk keeps the version
   it was written with, and the number is what tells the loader which upgrades
   it still needs. */
export const PATCH_SCHEMA_VERSION = 2

export interface Patch {
  readonly schemaVersion: number
  readonly id: string
  readonly name: string
  readonly notes: string
  /* Raw stored values, keyed by control id. Values for controls the registry does
     not know are kept here verbatim so a round-trip through an older build does
     not destroy a newer build's data. */
  readonly values: Readonly<Record<string, ControlValue>>
  /* What the library groups by. Several per patch and free-form: a sound is a
     synth bass and a disco bass at once, and no fixed list survives contact
     with what people actually call things. */
  readonly categories: readonly string[]
  /* Which instrument the patch is for. One today, and it is written down
     rather than assumed so the library can filter on it the day there are
     two. */
  readonly synth: string
  /* Stars, 0 to 5, where 0 means nobody has said. */
  readonly rating: number
  readonly createdAt: string
  readonly updatedAt: string
}

export const MINIMOOG = 'Minimoog Model D'
export const MAX_RATING = 5

export interface PatchIdentity {
  readonly newId: () => string
  readonly now: () => string
}

/* crypto.randomUUID exists only in a secure context, so it is present on
   https:// and on localhost but missing over plain http to a LAN address — which
   is exactly how the dev server is reached from another device. getRandomValues
   carries no such restriction, so a v4 uuid is assembled from it instead; the
   Math.random path is a last resort for an environment offering neither.

   Patch ids must stay unique because they are what storage and export key on. */
function newUuid(): string {
  const source = globalThis.crypto
  if (typeof source?.randomUUID === 'function') return source.randomUUID()

  const bytes = new Uint8Array(16)
  if (typeof source?.getRandomValues === 'function') {
    source.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}

export const systemIdentity: PatchIdentity = {
  newId: newUuid,
  now: () => new Date().toISOString(),
}

export function createPatch(
  fields: {
    name?: string
    notes?: string
    values?: Readonly<Record<string, ControlValue>>
    categories?: readonly string[]
    synth?: string
    rating?: number
  },
  identity: PatchIdentity = systemIdentity,
): Patch {
  const timestamp = identity.now()
  return {
    schemaVersion: PATCH_SCHEMA_VERSION,
    id: identity.newId(),
    name: fields.name ?? '',
    notes: fields.notes ?? '',
    values: { ...(fields.values ?? {}) },
    categories: [...(fields.categories ?? [])],
    synth: fields.synth ?? MINIMOOG,
    rating: fields.rating ?? 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function touchPatch(patch: Patch, identity: PatchIdentity = systemIdentity): Patch {
  return { ...patch, updatedAt: identity.now() }
}

/* Structural validation only: are the fields present and of the right primitive
   shape. Whether an individual control value makes sense is resolvePatch's job,
   kept separate because a patch carrying an out-of-range knob value is still a
   structurally valid patch and should load.

   `values` is deliberately a passthrough of unknown: a value belongs to its
   control's codec, and a schema that judged them here would reject the ids this
   build does not know yet — the very ones the format promises to preserve. */
export const patchSchema = z.object({
  schemaVersion: z.int(),
  id: z.string().min(1),
  name: z.string(),
  notes: z.string(),
  values: z.record(z.string(), z.unknown()),
  categories: z.array(z.string()),
  synth: z.string(),
  rating: z.int().min(0).max(MAX_RATING),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/* Zod reports every problem at once and names the field; the first line is
   enough for a person looking at a file that will not open. */
export function describeZodError(error: z.ZodError): string {
  const first = error.issues[0]
  if (!first) return 'is not valid'
  const path = first.path.join('.')
  return path ? `${path}: ${first.message}` : first.message
}

export function parsePatch(raw: unknown): Result<Patch> {
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) return err(`Patch ${describeZodError(parsed.error)}`)
  return ok(parsed.data as Patch)
}
