import { z } from 'zod'
import type { ControlValue } from '../controls/types.ts'
import { DEFAULT_INSTRUMENT } from '../instruments/instruments.ts'
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
  /* What the library groups by. Several per patch: a sound is a synth bass and
     a disco bass at once. Stored as plain strings and pointing at nothing, so
     retiring a tag from the list an admin keeps leaves every patch already
     wearing it exactly as it was — and an exported patch still means something
     somewhere that has never heard of it. */
  readonly tags: readonly string[]
  /* Which instrument this is for, by id. It decides which registry reads
     `values`, so it is part of the patch rather than of where it is kept. */
  readonly instrument: string
  /* Whether anyone but the owner can see it. Factory content is public by
     definition; a patch you make is yours until you say otherwise. */
  readonly visibility: Visibility
  /* Set when the values are a reconstruction rather than settings read off an
     instrument, so the UI can say so rather than letting a guess pass for a
     measurement. Was a preset-only field; a preset is a patch now. */
  readonly approximate: boolean
  /* What this was copied from, if anything. */
  readonly derivedFrom: Provenance | null
  readonly createdAt: string
  readonly updatedAt: string
}

export const VISIBILITIES = ['private', 'public'] as const
export type Visibility = (typeof VISIBILITIES)[number]

/* Where a copy came from, recorded as a snapshot rather than a reference. The
   source can be renamed, hidden or deleted, and a pointer the UI has to resolve
   is worse than a fact: keeping the name means the credit survives the original
   going away. One link, to the immediate parent — walk it while the ancestors
   exist and you have the chain; store the chain in every copy and it rots. */
export interface Provenance {
  readonly id: string
  readonly name: string
  readonly kind: 'factory' | 'user'
  readonly ownerId: string | null
  readonly ownerName: string | null
  readonly at: string
}

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
    tags?: readonly string[]
    instrument?: string
    visibility?: Visibility
    approximate?: boolean
    derivedFrom?: Provenance | null
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
    tags: [...(fields.tags ?? [])],
    instrument: fields.instrument ?? DEFAULT_INSTRUMENT.id,
    /* Private unless said otherwise: publishing is an act, and a default that
       publishes would be one nobody chose. */
    visibility: fields.visibility ?? 'private',
    approximate: fields.approximate ?? false,
    derivedFrom: fields.derivedFrom ?? null,
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
const provenanceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.enum(['factory', 'user']),
  ownerId: z.string().nullable(),
  ownerName: z.string().nullable(),
  at: z.string(),
})

export const patchSchema = z.object({
  schemaVersion: z.int(),
  id: z.string().min(1),
  name: z.string(),
  notes: z.string(),
  values: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
  instrument: z.string().min(1),
  visibility: z.enum(VISIBILITIES),
  approximate: z.boolean(),
  derivedFrom: provenanceSchema.nullable(),
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
