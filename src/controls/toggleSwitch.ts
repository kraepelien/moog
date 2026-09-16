import { makeDiscreteType, type DiscreteDef, type DiscretePosition } from './discrete.ts'
import type { ControlDef } from './types.ts'

export { positionIndex, stepBy } from './discrete.ts'

/* A two-position rocker. Not a boolean: several of these choose between two named
   things rather than turning one thing on — Osc.3 against Filter EG, White against
   Pink, Osc.3 against LO. Modelling them as true/false would force a label map at
   every call site and would mean a type change the day one gains a third position.

   The two positions print at the two ends, so exactly two, in the order they are
   drawn: for a horizontal switch that is left then right, for a vertical one top
   then bottom. A position may carry an empty label — an ON switch prints a legend
   on one side only. */

export type CapColour = 'orange' | 'blue' | 'black' | 'white'

export interface ToggleSwitchDef extends DiscreteDef {
  readonly type: 'toggleSwitch'
  readonly positions: readonly [DiscretePosition, DiscretePosition]
  /* Printed above the switch, centred, when the panel gives it its own heading
     rather than relying on the end legends. */
  readonly headline?: string
  readonly orientation?: 'horizontal' | 'vertical'
  /* Which cap the instrument fits. The Minimoog colour-codes its rockers:
     orange for the modulation and filter routing, blue for the mixer sources
     and the output, black for the two modulation source selectors, white for
     the two beside the wheels. Orange when unsaid. */
  readonly cap?: CapColour
}

export const toggleSwitchType = makeDiscreteType<ToggleSwitchDef>('toggleSwitch')

export function isToggleSwitch(def: ControlDef): def is ToggleSwitchDef {
  return def.type === 'toggleSwitch'
}
