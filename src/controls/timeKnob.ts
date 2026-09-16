import type { ControlDef, ControlType, DecodeResult } from './types.ts'

/* A knob whose printed scale is not proportional to its travel. Attack and Decay
   sweep from instant to thirty seconds through marks that are evenly spaced
   around the dial while their values are not: the first half of the turn covers
   0 to 800 ms, the second half covers 1 to 30 seconds.

   What is stored is **milliseconds** — a real quantity, so it keeps its meaning
   if the dial is ever redrawn, and it reads plainly in an exported patch. A
   fraction of travel would mean the number in the file only made sense against
   the version of the table that produced it. */

export interface TimeKnobDef extends ControlDef {
  readonly type: 'timeKnob'
  /* Milliseconds at each printed mark, ascending. The marks are evenly spaced
     around the sweep however uneven these are; that even spacing is what puts
     800 ms at exactly half travel, which is how the knob was described. */
  readonly anchors: readonly number[]
  readonly default: number
  /* One nudge, as a fraction of total travel. A fixed step in milliseconds
     cannot work here: 10 ms is an enormous jump at the bottom of the scale and
     invisible at the top. */
  readonly stepFraction?: number
  readonly size?: 'small' | 'large'
  /* Printed under each end of the scale, as the panel does. */
  readonly unitLabels?: { readonly low: string; readonly high: string }
}

export const DEFAULT_STEP_FRACTION = 1 / 120

export function stepFractionOf(def: TimeKnobDef): number {
  return def.stepFraction ?? DEFAULT_STEP_FRACTION
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

export function minMs(def: TimeKnobDef): number {
  return def.anchors[0]!
}

export function maxMs(def: TimeKnobDef): number {
  return def.anchors[def.anchors.length - 1]!
}

/* Fraction of travel (0 to 1) to milliseconds, interpolating within whichever
   pair of marks the position falls between. */
export function msAtFraction(def: TimeKnobDef, fraction: number): number {
  const anchors = def.anchors
  const segments = anchors.length - 1
  const x = clamp(fraction, 0, 1) * segments
  const index = Math.min(segments - 1, Math.floor(x))
  const t = x - index
  return anchors[index]! + t * (anchors[index + 1]! - anchors[index]!)
}

/* The inverse, for placing the indicator from a stored value. */
export function fractionForMs(def: TimeKnobDef, ms: number): number {
  const anchors = def.anchors
  const segments = anchors.length - 1
  const value = clamp(ms, minMs(def), maxMs(def))
  for (let i = 0; i < segments; i++) {
    const low = anchors[i]!
    const high = anchors[i + 1]!
    if (value <= high) {
      /* A zero-width segment would divide by zero; sit at its start instead. */
      const t = high === low ? 0 : (value - low) / (high - low)
      return (i + t) / segments
    }
  }
  return 1
}

/* Rounded to whole milliseconds: the stored value is a duration, and a patch
   file carrying 799.9999999999999 would be the visible cost of not rounding.
   Landing within half a nudge of a printed mark snaps exactly onto it, so the
   marked values stay reachable by keyboard. */
export function quantiseMs(def: TimeKnobDef, ms: number): number {
  const fraction = fractionForMs(def, ms)
  const segments = def.anchors.length - 1
  const tolerance = stepFractionOf(def) / 2
  for (let i = 0; i <= segments; i++) {
    if (Math.abs(fraction - i / segments) <= tolerance) return def.anchors[i]!
  }
  return Math.round(clamp(ms, minMs(def), maxMs(def)))
}

/* Bare number for the dial, where the unit is printed once at each end. */
export function scaleLabel(ms: number): string {
  return ms < 1000 ? String(ms) : String(Number((ms / 1000).toFixed(2)))
}

/* Full reading for the cap and for any text display. */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${Number((ms / 1000).toFixed(2))} s`
}

/* Reads a typed value back. A bare number is milliseconds, because that is the
   unit the control stores; seconds have to be said, so "1.5" cannot silently
   mean a second and a half when the rest of the scale is in milliseconds.
   Returns null for anything unparseable rather than guessing. */
export function parseTimeInput(text: string): number | null {
  const cleaned = text.trim().toLowerCase().replace(',', '.')
  const match = /^(\d*\.?\d+)\s*(ms|msec|s|sec)?$/.exec(cleaned)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  const unit = match[2]
  return unit === 's' || unit === 'sec' ? amount * 1000 : amount
}

export const timeKnobType: ControlType<TimeKnobDef, number> = {
  type: 'timeKnob',
  decode(raw, def): DecodeResult<number> {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return { status: 'invalid', reason: `expected milliseconds, got ${typeof raw}` }
    }
    const low = minMs(def)
    const high = maxMs(def)
    if (raw < low) return { status: 'coerced', value: low, reason: `below minimum ${low} ms` }
    if (raw > high) return { status: 'coerced', value: high, reason: `above maximum ${high} ms` }
    return { status: 'ok', value: raw }
  },
  defaultValue: (def) => def.default,
  format: (value) => formatMs(value),
  validateDef(def) {
    if (def.anchors.length < 2) return 'needs at least two marks'
    for (let i = 1; i < def.anchors.length; i++) {
      if (!(def.anchors[i]! > def.anchors[i - 1]!)) {
        return `marks must ascend, but ${def.anchors[i - 1]} is followed by ${def.anchors[i]}`
      }
    }
    if (def.default < minMs(def) || def.default > maxMs(def)) {
      return `default ${def.default} is outside ${minMs(def)}…${maxMs(def)} ms`
    }
    const step = stepFractionOf(def)
    if (!(step > 0 && step <= 1)) return `stepFraction ${step} must be between 0 and 1`
    return null
  },
}

export function isTimeKnob(def: ControlDef): def is TimeKnobDef {
  return def.type === 'timeKnob'
}
