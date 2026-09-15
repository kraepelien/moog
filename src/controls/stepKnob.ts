import type { ControlDef, ControlType, DecodeResult } from './types.ts'

/* A knob that rests only on named positions. What is stored is the position's id,
   never its label and never its index: a label can be re-typeset (8' → 8″) and an
   index shifts the moment a position is inserted, and either would silently
   change what every saved patch means. The id is the permanent part. */

export interface StepPosition {
  readonly id: string
  /* What the panel prints beside the detent. */
  readonly label: string
  /* A waveform mark instead of text, by id from waveforms.ts. */
  readonly glyph?: string
  /* What the knob's cap reads when resting here, if anything. */
  readonly cap?: string
}

export interface StepKnobDef extends ControlDef {
  readonly type: 'stepKnob'
  readonly positions: readonly StepPosition[]
  /* A position id. Validated at registry construction, not trusted. */
  readonly default: string
}

export const stepKnobType: ControlType<StepKnobDef, string> = {
  type: 'stepKnob',
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

export function isStepKnob(def: ControlDef): def is StepKnobDef {
  return def.type === 'stepKnob'
}

export function positionIndex(def: StepKnobDef, value: string): number {
  const index = def.positions.findIndex((position) => position.id === value)
  return index === -1 ? def.positions.findIndex((p) => p.id === def.default) : index
}

/* Clamped rather than wrapping: a rotary selector has end stops, and wrapping from
   the last position back to the first would make a drag past the end jump the
   value across the whole range. */
export function stepBy(def: StepKnobDef, value: string, delta: number): string {
  const next = Math.min(
    def.positions.length - 1,
    Math.max(0, positionIndex(def, value) + delta),
  )
  return def.positions[next]!.id
}
