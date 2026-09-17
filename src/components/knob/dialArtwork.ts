/* The knob body is lifted verbatim from reference/artwork/KNOB 5.svg. Only the
   grouping and the colour references are ours — do not redraw it.

   That export is drawn in its own 100-unit box around (50, 50), while this dial
   is 116 units around (53, 65) with its ticks and numerals already placed around
   it. The path is fitted to that by a group transform rather than re-pathed: a
   transform is grouping, which is ours to change, and the path is not.

   The export also carries a `0` in its cap. That is the digit it happened to be
   drawn with, not artwork — the dial prints the live value as text over the cap,
   so the glyph is left out.

   It is drawn with its dot straight up, so bakedAngle is 0 and rendering a value
   turns the group by the angle itself. */

export const CENTRE = { x: 53, y: 65 } as const

/* Measured off the spoke endpoints in the exports rather than assumed. */
export const SWEEP_START = -150
export const SWEEP_END = 150
export const TICK_OUTER = 39
export const TICK_INNER = 30
export const LABEL_RADIUS = 50

/* Square, centred on the knob, with room for the printed numerals. */
export const VIEWBOX = { x: -5, y: 7, width: 116, height: 116 } as const

/* What the export measures, so the fit below reads against the drawing rather
   than being taken on trust. The width is of the flattened outline; the rest are
   read straight off the elements. */
const EXPORT = {
  centre: { x: 50, y: 50 },
  /* Recovered from the outline by solving each curve's extrema, not read off the
     viewBox: the export is a 100-unit box and the drawing does not fill it. */
  width: 72.84,
  capRadius: 28,
  dotRadius: 3,
  /* Centre of the indicator dot, out from the centre of the knob. */
  dotAt: 31,
} as const

/* The width the exports this replaces were drawn at — measured, 60.6 and 60.5
   units across — which is the size the panel is laid out around. Fitting by
   width is how these drawings have always been compared. */
export const BODY_WIDTH = 60

const fit = (width: number) => width / EXPORT.width

/* On the group that turns, so the stroke widths in the stylesheet are the
   export's own and are scaled by the same fit as the shapes they outline.

   Taking a centre and a width rather than reading the dial's: the selector
   knobs on the oscillator bank are the same drawing on a wider dial of their
   own, and a second copy of this arithmetic is how the two would drift. */
export function fitTransform(
  centre: { x: number; y: number } = CENTRE,
  width: number = BODY_WIDTH,
): string {
  return (
    `translate(${centre.x} ${centre.y}) scale(${fit(width)}) ` +
    `translate(${-EXPORT.centre.x} ${-EXPORT.centre.y})`
  )
}

/* The cap in the dial's units, for whoever prints a reading inside it. */
export function capRadiusAt(width: number = BODY_WIDTH): number {
  return EXPORT.capRadius * fit(width)
}

/* In the export's own units, since they are drawn inside the fitted group. */
export const EXPORT_CENTRE = EXPORT.centre
export const CAP_RADIUS = EXPORT.capRadius
export const INDICATOR_RADIUS = EXPORT.dotRadius
export const INDICATOR_AT = EXPORT.dotAt

export const BODY = 'M50 12C52.1731 12 54.2884 12.7004 56.0322 13.9971L62.6201 18.8955C63.5923 19.6185 64.6881 20.159 65.8535 20.4902L73.54 22.6748C75.7122 23.2922 77.6315 24.5864 79.0176 26.3691C80.366 28.1035 81.1429 30.2145 81.2412 32.4092L81.6211 40.8877V40.8887C81.6733 42.0537 81.9295 43.2004 82.377 44.2773L85.5869 52.0049C86.4479 54.0769 86.6485 56.3645 86.1611 58.5547C85.6678 60.7717 84.4945 62.7794 82.8047 64.2969L76.7422 69.7412C75.8598 70.5337 75.1253 71.4767 74.5732 72.5264L70.6543 79.9775C69.6463 81.8941 68.0577 83.4423 66.1162 84.4014C64.1308 85.3821 61.8816 85.6949 59.7041 85.292L51.8193 83.833C50.6166 83.6105 49.3834 83.6105 48.1807 83.833L40.2959 85.292C38.1184 85.6949 35.8692 85.3821 33.8838 84.4014C31.9423 83.4423 30.3537 81.8941 29.3457 79.9775L25.4268 72.5264C24.8747 71.4767 24.1402 70.5336 23.2578 69.7412L17.1953 64.2969C15.5055 62.7794 14.3322 60.7717 13.8389 58.5547C13.3515 56.3645 13.5521 54.0769 14.4131 52.0049L17.623 44.2773C18.0705 43.2004 18.3267 42.0537 18.3789 40.8887V40.8877L18.7588 32.4092C18.8571 30.2145 19.634 28.1035 20.9824 26.3691C22.3685 24.5864 24.2878 23.2922 26.46 22.6748L34.1465 20.4902C35.3119 20.159 36.4077 19.6185 37.3799 18.8955L43.9678 13.9971C45.7116 12.7004 47.8269 12 50 12Z'

export type KnobSize = 'small' | 'large'

/* One drawing for every knob: a bigger knob is a render scale and never a
   different path, which is what the panel does where the oscillator frequency
   knobs are physically bigger than the levels around them. */
export const SIZE_SCALE: Record<KnobSize, number> = {
  small: 1,
  large: 1.3,
}
