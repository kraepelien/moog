import type { ControlDef, ControlType, DecodeResult } from './types.ts'

/* Everything a control with named positions has in common, whether it is a
   six-position rotary selector or a two-position rocker. Both store the same
   thing and validate the same way; only the artwork and the gesture differ, so
   the codec lives here once and each type supplies its own name and component. */

export interface DiscretePosition {
  readonly id: string
  /* What the panel prints for this position. May be empty: an ON switch prints a
     legend on one side only. */
  readonly label: string
}

export interface DiscreteDef extends ControlDef {
  readonly positions: readonly DiscretePosition[]
  /* A position id. Checked when the registry is built, never trusted. */
  readonly default: string
}

/* What is stored is the position's id — never its label, never its index. A label
   can be re-typeset (8' → 8″, ON → I) and an index shifts the moment a position
   is inserted; either would silently change what every saved patch means. */
export function makeDiscreteType<D extends DiscreteDef>(typeName: string): ControlType<D, string> {
  return {
    type: typeName,
    decode(raw, def): DecodeResult<string> {
      if (typeof raw !== 'string') {
        return { status: 'invalid', reason: `expected a position id, got ${typeof raw}` }
      }
      if (!def.positions.some((position) => position.id === raw)) {
        return { status: 'invalid', reason: `"${raw}" is not a position of ${def.id}` }
      }
      return { status: 'ok', value: raw }
    },
    defaultValue: (def) => def.default,
    format: (value, def) => def.positions.find((p) => p.id === value)?.label ?? value,
    validateDef(def) {
      if (def.positions.length === 0) return 'has no positions'
      const ids = def.positions.map((position) => position.id)
      if (new Set(ids).size !== ids.length) return 'has duplicate position ids'
      const bad = ids.find((id) => !/^[A-Za-z0-9_-]+$/.test(id))
      if (bad !== undefined) return `position id "${bad}" is not safe to store`
      if (!ids.includes(def.default)) {
        return `default "${def.default}" is not one of its positions (${ids.join(', ')})`
      }
      return null
    },
  }
}

/* Ids and labels compared with punctuation and case thrown away, so "8" finds
   the position printed 8' and stored ft8. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/* Resolves typed text to a position id, or null if it is not clearly one thing.
   Tried in order of confidence: an exact id, an exact label, either of those
   ignoring case and punctuation, and finally a label prefix — but only when it
   picks out exactly one position, so "s" against Sawtooth and Square stays
   ambiguous rather than guessing. */
export function matchPosition(def: DiscreteDef, text: string): string | null {
  const raw = text.trim()
  if (raw === '') return null
  const lower = raw.toLowerCase()
  const key = normalise(raw)
  if (key === '') return null

  const byId = def.positions.find((p) => p.id.toLowerCase() === lower)
  if (byId) return byId.id

  const byLabel = def.positions.find((p) => p.label.toLowerCase() === lower)
  if (byLabel) return byLabel.id

  const loose = def.positions.filter(
    (p) => normalise(p.id) === key || normalise(p.label) === key,
  )
  if (loose.length === 1) return loose[0]!.id

  const prefixed = def.positions.filter((p) => normalise(p.label).startsWith(key))
  return prefixed.length === 1 ? prefixed[0]!.id : null
}

export function positionIndex(def: DiscreteDef, value: string): number {
  const index = def.positions.findIndex((position) => position.id === value)
  return index === -1 ? def.positions.findIndex((p) => p.id === def.default) : index
}

/* Clamped rather than wrapping: these controls have end stops, and wrapping from
   the last position back to the first would make a drag past the end jump the
   value across the whole range. */
export function stepBy(def: DiscreteDef, value: string, delta: number): string {
  const next = Math.min(def.positions.length - 1, Math.max(0, positionIndex(def, value) + delta))
  return def.positions[next]!.id
}
