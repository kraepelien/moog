import { isRecalled } from '../controls/recall.ts'
import type { Registry } from '../controls/registry.ts'
import type { ControlValue } from '../controls/types.ts'
import type { Patch } from './schema.ts'

export interface CoercionNote {
  readonly id: string
  readonly reason: string
}

export interface ResolveReport {
  /* Known controls the patch carries no value for. The normal case for any patch
     saved before a control existed, so it is not surfaced as a problem. */
  readonly missing: readonly string[]
  /* Values for ids the registry does not know. Kept in the patch, never rendered. */
  readonly unknown: readonly string[]
  readonly coerced: readonly CoercionNote[]
  /* Undecodable values that fell back to the control's default. */
  readonly invalid: readonly CoercionNote[]
}

export interface ResolvedPatch {
  readonly values: Readonly<Record<string, ControlValue>>
  readonly report: ResolveReport
}

export function reportHasWarnings(report: ResolveReport): boolean {
  return report.unknown.length > 0 || report.coerced.length > 0 || report.invalid.length > 0
}

/* Produces a complete value for every control in the registry, whatever the patch
   contained. Iterating the registry rather than the stored values is what makes
   unknown ids invisible to rendering without anyone having to filter them. */
export function resolvePatch(registry: Registry, patch: Patch): ResolvedPatch {
  const values: Record<string, ControlValue> = {}
  const missing: string[] = []
  const coerced: CoercionNote[] = []
  const invalid: CoercionNote[] = []

  for (const def of registry.controls) {
    const type = registry.controlType(def)

    /* A control a patch does not carry sits at its rest position on load,
       whatever an older build may have written for it. Not counted as missing:
       nothing is expected. */
    if (!isRecalled(def)) {
      values[def.id] = type.defaultValue(def)
      continue
    }

    if (!Object.hasOwn(patch.values, def.id)) {
      missing.push(def.id)
      values[def.id] = type.defaultValue(def)
      continue
    }

    const decoded = type.decode(patch.values[def.id], def)
    if (decoded.status === 'ok') {
      values[def.id] = decoded.value
    } else if (decoded.status === 'coerced') {
      coerced.push({ id: def.id, reason: decoded.reason })
      values[def.id] = decoded.value
    } else {
      invalid.push({ id: def.id, reason: decoded.reason })
      values[def.id] = type.defaultValue(def)
    }
  }

  const unknown = Object.keys(patch.values).filter((id) => registry.control(id) === undefined)

  return { values, report: { missing, unknown, coerced, invalid } }
}

/* Writes edited values back without disturbing anything the registry does not
   know about, so an older build cannot strip a newer build's controls.

   The one thing it does drop is a control the registry knows is not recalled:
   that is a value this build has decided the format does not hold, so leaving
   an older build's copy in place would keep it alive for ever. */
export function mergeValues(
  registry: Registry,
  patch: Patch,
  edited: Readonly<Record<string, ControlValue>>,
): Readonly<Record<string, ControlValue>> {
  const merged: Record<string, ControlValue> = { ...patch.values, ...edited }
  for (const id of Object.keys(merged)) {
    const def = registry.control(id)
    if (def && !isRecalled(def)) delete merged[id]
  }
  return merged
}
