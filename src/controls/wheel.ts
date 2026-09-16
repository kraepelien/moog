import type { ControlDef, ControlType, DecodeResult } from './types.ts'

/* The two performance wheels. Continuous like a knob, but travelling up and down
   rather than round, and with no printed numerals — the panel shows only the
   ribbed wheel and its marker.

   Pitch is sprung: the real wheel is centre-returning, so it cannot physically
   hold a position once your hand leaves it. That is recorded here as `springsTo`
   rather than assumed, because it changes what the control means in a saved
   patch and the UI has to decide whether to honour it. */

export interface WheelDef extends ControlDef {
  readonly type: 'wheel'
  readonly min: number
  readonly max: number
  readonly default: number
  readonly step: number
  readonly decimals?: number
  /* The value the wheel returns to when released, if it is sprung. */
  readonly springsTo?: number
}

export function wheelDecimals(def: WheelDef): number {
  if (def.decimals !== undefined) return def.decimals
  const text = String(def.step)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

export function quantiseWheel(def: WheelDef, value: number): number {
  const clamped = Math.min(def.max, Math.max(def.min, value))
  const steps = Math.round((clamped - def.min) / def.step)
  const snapped = def.min + steps * def.step
  return Number(Math.min(def.max, Math.max(def.min, snapped)).toFixed(10))
}

/* 0 at the bottom of the wheel, 1 at the top. */
export function wheelFraction(def: WheelDef, value: number): number {
  return (value - def.min) / (def.max - def.min)
}

export function isSprung(def: WheelDef): boolean {
  return def.springsTo !== undefined
}

export const wheelType: ControlType<WheelDef, number> = {
  type: 'wheel',
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
  format: (value, def) => value.toFixed(wheelDecimals(def)),
  validateDef(def) {
    if (!(def.min < def.max)) return `min ${def.min} is not below max ${def.max}`
    if (!(def.step > 0)) return `step ${def.step} must be positive`
    if (def.default < def.min || def.default > def.max) {
      return `default ${def.default} is outside ${def.min}…${def.max}`
    }
    if (def.springsTo !== undefined && (def.springsTo < def.min || def.springsTo > def.max)) {
      return `springsTo ${def.springsTo} is outside ${def.min}…${def.max}`
    }
    return null
  },
}

export function isWheel(def: ControlDef): def is WheelDef {
  return def.type === 'wheel'
}
