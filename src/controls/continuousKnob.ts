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
  /* Text printed instead of the numeral at a given value, as one line per entry.
     Modulation Mix is a level like any other but its ends name what it is mixing
     between, so 0 and 10 read as sources rather than as numbers. */
  readonly labels?: Readonly<Record<number, readonly string[]>>
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
  return stepDecimals(def)
}

/* The precision the control actually stores at, which may be finer than the one
   it usually prints. */
export function stepDecimals(def: { readonly step: number }): number {
  const text = String(def.step)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

/* Prints the usual precision, and the finer one only when there is something
   there to show. A control storing hundredths but always printing tenths would
   let you set 3.23 and never see that you had — 3.23 and 3.24 would read alike —
   so the extra digit appears exactly when it carries information. */
export function formatValue(def: ContinuousKnobDef, value: number): string {
  const shown = decimalsFor(def)
  const rounded = Number(value.toFixed(shown))
  return rounded === value ? value.toFixed(shown) : value.toFixed(stepDecimals(def))
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
  format: (value, def) => formatValue(def, value),
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
  /* Set when the scale names this value instead of numbering it. */
  readonly lines?: readonly string[]
}

/* Whether any mark carries text rather than a numeral, which needs more room
   around the dial than a number does. */
export function hasNamedMarks(def: ContinuousKnobDef): boolean {
  return Object.keys(def.scale?.labels ?? {}).length > 0
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
    const named = scale.labels?.[value]
    /* A named mark is always printed, whatever the label interval says. */
    const labelled =
      named !== undefined ||
      Math.abs(from + stepsFromZero * scale.labelStep - value) < scale.tickStep / 1000
    marks.push(named ? { value, labelled, lines: named } : { value, labelled })
  }

  if (def.max > to) marks.push({ value: def.max, labelled: false })

  return marks
}
