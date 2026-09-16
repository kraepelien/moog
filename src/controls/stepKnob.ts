import { makeDiscreteType, type DiscreteDef, type DiscretePosition } from './discrete.ts'
import type { ControlDef } from './types.ts'

export { matchPosition, positionIndex, stepBy } from './discrete.ts'

/* A knob that rests only on named positions. Six of them, one per detent on the
   artwork. */

export interface StepPosition extends DiscretePosition {
  /* A waveform mark instead of text, by id from waveforms.ts. */
  readonly glyph?: string
  /* What the knob's cap reads when resting here, if anything. */
  readonly cap?: string
}

export interface StepKnobDef extends DiscreteDef {
  readonly type: 'stepKnob'
  readonly positions: readonly StepPosition[]
}

export const stepKnobType = makeDiscreteType<StepKnobDef>('stepKnob')

export function isStepKnob(def: ControlDef): def is StepKnobDef {
  return def.type === 'stepKnob'
}
