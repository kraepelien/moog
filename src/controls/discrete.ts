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
