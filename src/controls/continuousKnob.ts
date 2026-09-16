import type { ControlDef, ControlType, DecodeResult } from './types.ts'

/* A knob that turns smoothly between two numbers. Unlike a step knob it stores a
   number, in the control's own printed units — a cutoff of -1.5 is stored as
   -1.5, not as a fraction of travel.

   That choice matters: normalising to 0..1 would mean changing a control's range
   later silently remaps every saved patch, and it would make the JSON unreadable
   for a format people send each other. Storing real units means a range change
   clamps instead, which is the right failure — a patch saved at maximum stays at
   maximum rather than jumping to the middle. */

export interface KnobScale {
  /* Where the printed numerals start and stop. Defaults to the full range,
     because on several of these controls the silkscreen stops short of where the
     knob actually travels — Tune prints to 2 but reaches 2.5. */
  readonly from?: number
  readonly to?: number
  readonly tickStep: number
  readonly labelStep: number
}

export interface ContinuousKnobDef extends ControlDef {
  readonly type: 'continuousKnob'
  readonly min: number
  readonly max: number
  readonly default: number
  /* What one nudge changes the value by, and what stored values are rounded to.
     Separate from the printed scale: a knob can print a numeral every 2 and
     still be settable in tenths. */
  readonly step: number
  /* Digits after the point when the value is shown. Derived from step if absent. */
  readonly decimals?: number
  readonly scale?: KnobScale
  readonly size?: 'small' | 'large'
}

export function decimalsFor(def: ContinuousKnobDef): number {
  if (def.decimals !== undefined) return def.decimals
  const text = String(def.step)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

/* Rounding to the step keeps stored values off the long binary tails that
   repeated addition produces — 0.1 added thirty times is not 3. */
export function quantise(def: ContinuousKnobDef, value: number): number {
  const clamped = Math.min(def.max, Math.max(def.min, value))
  const steps = Math.round((clamped - def.min) / def.step)
  const snapped = def.min + steps * def.step
  return Number(Math.min(def.max, Math.max(def.min, snapped)).toFixed(10))
}

export const continuousKnobType: ControlType<ContinuousKnobDef, number> = {
  type: 'continuousKnob',
  decode(raw, def): DecodeResult<number> {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return { status: 'invalid', reason: `expected a number, got ${typeof raw}` }
    }
    if (raw < def.min) {
      return { status: 'coerced', value: def.min, reason: `below minimum ${def.min}` }
    }
    if (raw > def.max) {
      return { status: 'coerced', value: def.max, reason: `above maximum ${def.max}` }
    }
    return { status: 'ok', value: raw }
  },
  defaultValue: (def) => def.default,
  format: (value, def) => value.toFixed(decimalsFor(def)),
  validateDef(def) {
    if (!(def.min < def.max)) return `min ${def.min} is not below max ${def.max}`
    if (!(def.step > 0)) return `step ${def.step} must be positive`
    if (def.default < def.min || def.default > def.max) {
      return `default ${def.default} is outside ${def.min}…${def.max}`
    }
    const scale = def.scale
    if (scale) {
      if (!(scale.tickStep > 0)) return `scale tickStep ${scale.tickStep} must be positive`
      if (!(scale.labelStep > 0)) return `scale labelStep ${scale.labelStep} must be positive`
      const from = scale.from ?? def.min
      const to = scale.to ?? def.max
      if (from < def.min || to > def.max) {
        return `printed scale ${from}…${to} runs outside the range ${def.min}…${def.max}`
      }
    }
    return null
  },
}

export function isContinuousKnob(def: ControlDef): def is ContinuousKnobDef {
  return def.type === 'continuousKnob'
}

export interface ScaleMark {
  readonly value: number
  readonly labelled: boolean
}

/* Numerals come from the printed scale, which stops short of the range on several
   controls. The travel past the last numeral still gets a tick, unlabelled, so a
   knob that reaches 8 while printing to 7 does not look like it stops at 7 —
   otherwise the extra travel is invisible and reads as a bug. */
export function scaleMarks(def: ContinuousKnobDef): readonly ScaleMark[] {
  const scale = def.scale
  if (!scale) return []
  const from = scale.from ?? def.min
  const to = scale.to ?? def.max
  const marks: ScaleMark[] = []

  if (def.min < from) marks.push({ value: def.min, labelled: false })

  const count = Math.round((to - from) / scale.tickStep)
  for (let i = 0; i <= count; i++) {
    const value = Number((from + i * scale.tickStep).toFixed(10))
    const stepsFromZero = Math.round((value - from) / scale.labelStep)
    const labelled =
      Math.abs(from + stepsFromZero * scale.labelStep - value) < scale.tickStep / 1000
    marks.push({ value, labelled })
  }

  if (def.max > to) marks.push({ value: def.max, labelled: false })

  return marks
}
