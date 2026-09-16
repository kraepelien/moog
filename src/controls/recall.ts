import type { ControlDef } from './types.ts'
import { isSprung, isWheel } from './wheel.ts'

/* Whether a patch carries this control's value.

   A sprung control returns to its rest position the moment it is let go, so a
   stored setting would be a position the instrument cannot hold — the pitch
   wheel is played, not set. It stays on the panel and stays movable; it just
   leaves nothing behind in the file, and a value one carried from an earlier
   build is ignored rather than honoured. */
export function isRecalled(def: ControlDef): boolean {
  return !(isWheel(def) && isSprung(def))
}
