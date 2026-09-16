import { CENTRE, SWEEP_END, SWEEP_START } from './dialArtwork.ts'

export function pointAt(angleDeg: number, radius: number) {
  const radians = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: CENTRE.x + Math.cos(radians) * radius,
    y: CENTRE.y + Math.sin(radians) * radius,
  }
}

/* Where a fraction of the knob's travel sits on the dial. Both knob types turn
   through the same sweep; they differ only in how a stored value becomes a
   fraction — linearly for a continuous knob, through a table for a time knob. */
export function angleForFraction(fraction: number): number {
  return SWEEP_START + fraction * (SWEEP_END - SWEEP_START)
}
