/* Where a contour has got to, worked out rather than asked.
 *
 * A key pressed during another note's release has to take the envelope from
 * wherever it is, and Web Audio will not reliably say: reading a parameter
 * mid-automation is implementation-defined, and `cancelAndHoldAtTime`, which
 * exists for exactly this, is missing in Firefox. So the engine keeps the shape
 * and the start time and computes the level itself, which it can then schedule
 * from.
 *
 * Attack, decay and sustain are one running stage: they follow from a single key
 * press without another event to divide them, and a retrigger needs to know
 * which of the three it interrupted.
 */

import type { EnvelopeSettings } from './settings.ts'

export type Stage = 'idle' | 'attack' | 'decay' | 'sustain' | 'release'

export interface Running {
  /* Only these three are ever started; the finer stages are read back out of
     the time since. */
  readonly stage: 'idle' | 'attack' | 'release'
  readonly since: number
  /* The level it started from, which is not 0 when a note interrupts a
     release. */
  readonly from: number
}

export const IDLE: Running = { stage: 'idle', since: 0, from: 0 }

const between = (from: number, to: number, fraction: number): number =>
  from + (to - from) * Math.min(1, Math.max(0, fraction))

export function stageAt(run: Running, shape: EnvelopeSettings, now: number): Stage {
  if (run.stage !== 'attack') return run.stage
  const elapsed = Math.max(0, now - run.since)
  if (elapsed < shape.attackSeconds) return 'attack'
  if (elapsed < shape.attackSeconds + shape.decaySeconds) return 'decay'
  return 'sustain'
}

export function levelAt(run: Running, shape: EnvelopeSettings, now: number): number {
  const elapsed = Math.max(0, now - run.since)
  if (run.stage === 'idle') return 0
  if (run.stage === 'release') {
    if (shape.releaseSeconds <= 0) return 0
    return between(run.from, 0, elapsed / shape.releaseSeconds)
  }
  if (elapsed < shape.attackSeconds) return between(run.from, 1, elapsed / shape.attackSeconds)
  const intoDecay = elapsed - shape.attackSeconds
  if (intoDecay < shape.decaySeconds) {
    return between(1, shape.sustain, intoDecay / shape.decaySeconds)
  }
  return shape.sustain
}
