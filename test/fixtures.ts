import { createRegistry, type Registry } from '@controls/registry.ts'
import type { ControlDef, ControlType, DecodeResult } from '@controls/types.ts'
import type { PatchIdentity } from '@patch/schema.ts'

/* Fake control types, defined here rather than in src/ because no real control
   has been specified yet. They exist to prove the registry, resolver and importer
   are generic over control types — anything shaped like this works, and neither
   of these is a design proposal for an actual Minimoog control. */

export interface TestNumberDef extends ControlDef {
  readonly type: 'test-number'
  readonly min: number
  readonly max: number
  readonly default: number
}

export const testNumberType: ControlType<TestNumberDef, number> = {
  type: 'test-number',
  decode(raw, def): DecodeResult<number> {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return { status: 'invalid', reason: 'not a finite number' }
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
  format: (value) => value.toFixed(2),
}

export interface TestEnumDef extends ControlDef {
  readonly type: 'test-enum'
  readonly positions: readonly { readonly id: string; readonly label: string }[]
  readonly default: string
}

export const testEnumType: ControlType<TestEnumDef, string> = {
  type: 'test-enum',
  decode(raw, def): DecodeResult<string> {
    if (typeof raw !== 'string') return { status: 'invalid', reason: 'not a string' }
    if (!def.positions.some((position) => position.id === raw)) {
      return { status: 'invalid', reason: `"${raw}" is not a position of ${def.id}` }
    }
    return { status: 'ok', value: raw }
  },
  defaultValue: (def) => def.default,
  format: (value, def) => def.positions.find((p) => p.id === value)?.label ?? value,
}

export const volumeDef: TestNumberDef = {
  id: 'testVolume',
  type: 'test-number',
  label: 'Test Volume',
  section: 'testSection',
  min: 0,
  max: 10,
  default: 5,
}

export const rangeDef: TestEnumDef = {
  id: 'testRange',
  type: 'test-enum',
  label: 'Test Range',
  section: 'testSection',
  positions: [
    { id: 'lo', label: 'LO' },
    { id: 'hi', label: 'HI' },
  ],
  default: 'lo',
}

export function testRegistry(): Registry {
  return createRegistry({
    types: [testNumberType, testEnumType] as unknown as readonly ControlType<never, never>[],
    sections: [{ id: 'testSection', label: 'Test Section' }],
    items: [volumeDef, rangeDef],
  })
}

/* Deterministic ids and timestamps so imports and saves are assertable. */
export function fixedIdentity(prefix = 'id'): PatchIdentity {
  let counter = 0
  return {
    newId: () => `${prefix}-${++counter}`,
    now: () => '2026-01-01T00:00:00.000Z',
  }
}
