import type { ControlValue } from '../controls/types.ts'
import { err, ok, type Result } from '../result.ts'

export const PATCH_SCHEMA_VERSION = 1

export interface Patch {
  readonly schemaVersion: number
  readonly id: string
  readonly name: string
  readonly notes: string
  /* Raw stored values, keyed by control id. Values for controls the registry does
     not know are kept here verbatim so a round-trip through an older build does
     not destroy a newer build's data. */
  readonly values: Readonly<Record<string, ControlValue>>
  readonly createdAt: string
  readonly updatedAt: string
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
  fields: { name?: string; notes?: string; values?: Readonly<Record<string, ControlValue>> },
  identity: PatchIdentity = systemIdentity,
): Patch {
  const timestamp = identity.now()
  return {
    schemaVersion: PATCH_SCHEMA_VERSION,
    id: identity.newId(),
    name: fields.name ?? '',
    notes: fields.notes ?? '',
    values: { ...(fields.values ?? {}) },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function touchPatch(patch: Patch, identity: PatchIdentity = systemIdentity): Patch {
  return { ...patch, updatedAt: identity.now() }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/* Structural validation only: are the fields present and of the right primitive
   shape. Whether an individual control value makes sense is resolvePatch's job,
   kept separate because a patch carrying an out-of-range knob value is still a
   structurally valid patch and should load. */
export function parsePatch(raw: unknown): Result<Patch> {
  if (!isPlainObject(raw)) return err('Patch is not an object')

  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion)) {
    return err('Patch is missing an integer schemaVersion')
  }
  if (typeof raw.id !== 'string' || raw.id === '') return err('Patch is missing an id')
  if (typeof raw.name !== 'string') return err('Patch name must be a string')
  if (typeof raw.notes !== 'string') return err('Patch notes must be a string')
  if (!isPlainObject(raw.values)) return err('Patch values must be an object')
  if (typeof raw.createdAt !== 'string') return err('Patch createdAt must be a string')
  if (typeof raw.updatedAt !== 'string') return err('Patch updatedAt must be a string')

  return ok({
    schemaVersion: raw.schemaVersion,
    id: raw.id,
    name: raw.name,
    notes: raw.notes,
    values: raw.values as Record<string, ControlValue>,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  })
}
