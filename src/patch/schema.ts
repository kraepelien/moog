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

export const systemIdentity: PatchIdentity = {
  newId: () => crypto.randomUUID(),
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
