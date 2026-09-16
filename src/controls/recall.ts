import type { ControlDef } from './types.ts'
import { isSprung, isWheel } from './wheel.ts'

/* A sprung control cannot hold a position once your hand leaves it, and the
   output levels describe the room rather than the sound. Both stay on the panel
   and stay usable; they just leave nothing in the file. */
export function isRecalled(def: ControlDef): boolean {
  if (def.recalled === false) return false
  return !(isWheel(def) && isSprung(def))
}
