/* A control's stored value is whatever its type's codec decodes to. Patches hold
   raw JSON, so nothing downstream may assume a value has been through a codec. */
export type ControlValue = unknown

export interface SectionDef {
  readonly id: string
  readonly label: string
}

/* Fields every control has regardless of type. A control type extends this with
   its own configuration: range or positions, display formatting, input response. */
export interface ControlDefBase {
  readonly id: string
  readonly type: string
  readonly label: string
  readonly section: string
}

export type ControlDef = ControlDefBase

export type DecodeResult<V> =
  | { readonly status: 'ok'; readonly value: V }
  | { readonly status: 'coerced'; readonly value: V; readonly reason: string }
  | { readonly status: 'invalid'; readonly reason: string }

/* Methods, not function properties: TypeScript keeps method parameters bivariant,
   which is what lets a ControlType<SpecificDef, number> sit in a registry typed
   over ControlDef. */
export interface ControlType<D extends ControlDef = ControlDef, V = ControlValue> {
  readonly type: string
  /* The entire validation policy for this type in one place. resolvePatch maps
     these three outcomes onto the patch load report. */
  decode(raw: unknown, def: D): DecodeResult<V>
  defaultValue(def: D): V
  format(value: V, def: D): string
}
