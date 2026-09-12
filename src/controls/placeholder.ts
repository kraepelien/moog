import type { ControlDef, ControlType, DecodeResult } from './types.ts'

/* Stands in for a control that has not been specified yet, so the panel layout can
   be reviewed before any control exists. It deliberately has no range, no
   positions and no default: inventing those is the thing a placeholder is supposed
   to avoid.

   Its value is always null, and decode preserves whatever it is handed rather than
   judging it, so a placeholder can neither write a made-up value into a patch nor
   destroy a real one that a later build will understand. Replacing a placeholder
   means changing `type` on its registry entry — nothing else moves. */

export type PlaceholderShape = 'knob' | 'selector' | 'switch' | 'wheel' | 'lamp' | 'jack'

export interface PlaceholderDef extends ControlDef {
  readonly type: 'placeholder'
  /* Roughly how much room to leave and what outline to draw, so the layout reads
     correctly during review. Not a design decision and not part of any real
     control type — it disappears with the placeholder. */
  readonly shape: PlaceholderShape
  /* What the printed scale says, copied off the patch sheet purely as a caption.
     Not a range: the actual range, steps and defaults are still unspecified. */
  readonly sheetScale?: string
}

export const placeholderType: ControlType<PlaceholderDef, unknown> = {
  type: 'placeholder',
  decode(raw): DecodeResult<unknown> {
    /* Passes the stored value straight through, and never reports invalid. A
       placeholder has no opinion about what a value should be, so it must not
       narrow one: returning null here would let mergeValues write that null back
       over a real value saved by the build that defined this control properly. */
    return { status: 'ok', value: raw }
  },
  /* Only ever used for a control the patch has no value for at all. */
  defaultValue: () => null,
  format: () => 'not specified',
}

export function isPlaceholder(def: ControlDef): def is PlaceholderDef {
  return def.type === 'placeholder'
}
