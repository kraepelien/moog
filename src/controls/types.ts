/* A control's stored value is whatever its type's codec decodes to. Patches hold
   raw JSON, so nothing downstream may assume a value has been through a codec. */
export type ControlValue = unknown

export interface SectionDef {
  readonly id: string
  readonly label: string
}

/* A named box inside a section, for the groupings the patch sheet prints inside
   one heading — Loudness Contour sitting under Modifiers, or one oscillator's row
   of Range/Frequency/Waveform. Consecutive controls sharing a group render
   together; a group with no label groups without drawing a box. */
export interface GroupDef {
  readonly id: string
  readonly label: string
  readonly section: string
}

/* Fields every control has regardless of type. A control type extends this with
   its own configuration: range or positions, display formatting, input response. */
export interface ControlDefBase {
  readonly id: string
  readonly type: string
  readonly label: string
  readonly section: string
  readonly group?: string
  /* False for a control the instrument has and a player uses, but a patch does
     not carry: the monitoring levels and the output switches, which say nothing
     about how a sound is made and would be wrong to restore over whatever the
     room is set to. It still turns, and it still reads out. */
  readonly recalled?: boolean
}

export type ControlDef = ControlDefBase

/* Drawn on the panel but holding nothing: an indicator lamp, a socket, or a
   control that exists on the instrument and says nothing about how a sound is
   made — master volume, power. A patch is the set of control values, so these
   must never reach one. Keeping them out of `controls` rather than flagging them
   inside it means resolvePatch, defaultValues and the patch schema need no
   awareness of them at all. */
export interface DecorationDef {
  readonly kind: 'decoration'
  readonly id: string
  readonly label: string
  readonly section: string
  readonly group?: string
  readonly shape: string
  /* What colour the instrument paints it, where it has one: the output
     switches are blue caps like the mixer's, the pilot lamp is red. */
  readonly cap?: string
  readonly note?: string
}

export type PanelItem = ControlDef | DecorationDef

export function isDecoration(item: PanelItem): item is DecorationDef {
  return 'kind' in item && item.kind === 'decoration'
}

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
  /* Checked once when the registry is built, so a definition that contradicts
     itself — a default that is not one of the control's own positions — fails at
     startup rather than as a puzzling value at runtime. Return a reason to reject.
     Optional: a type with nothing beyond the base fields to check omits it. */
  validateDef?(def: D): string | null
}
