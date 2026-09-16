import type { ControlDef } from './types.ts'
import { isSprung, isWheel } from './wheel.ts'

/* Whether a patch carries this control's value.

   Two reasons one would not. A sprung control returns to its rest position the
   moment it is let go, so a stored setting would be a position the instrument
   cannot hold — the pitch wheel is played, not set. And a control can say so
   itself: the output levels and switches are real, and turning them does
   something, but they describe the room rather than the sound.

   Either way the control stays on the panel and stays usable; it just leaves
   nothing behind in the file, and a value one carried from an earlier build is
   ignored rather than honoured. */
export function isRecalled(def: ControlDef): boolean {
  if (def.recalled === false) return false
  return !(isWheel(def) && isSprung(def))
}
