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
  width: 75.28,
  capRadius: 30,
  dotRadius: 3,
  /* Centre of the indicator dot, out from the centre of the knob. */
  dotAt: 34.5,
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

export const BODY = 'M48.6396 11L51.3604 11C52.865 11 54.3296 11.485 55.5371 12.3828L63.2168 18.0938C64.0918 18.7444 65.0781 19.2302 66.127 19.5283L75.2676 22.126C76.7002 22.5332 77.9657 23.3877 78.8799 24.5635L80.708 26.9141C81.5973 28.0579 82.1099 29.45 82.1748 30.8975L82.6201 40.8438C82.6671 41.8922 82.8972 42.9244 83.2998 43.8936L87.1055 53.0527C87.6583 54.3833 87.7875 55.8523 87.4746 57.2588L86.7969 60.3047C86.48 61.7284 85.7258 63.0177 84.6406 63.9922L77.4102 70.4854C76.616 71.1986 75.9549 72.0475 75.458 72.9922L70.8955 81.668C70.208 82.9752 69.1241 84.0314 67.7998 84.6855L65.2891 85.9258C63.9348 86.5947 62.4003 86.808 60.915 86.5332L51.6377 84.8164C50.5552 84.6161 49.4448 84.6161 48.3623 84.8164L39.085 86.5332C37.5997 86.808 36.0652 86.5947 34.7109 85.9258L32.2002 84.6855C30.8759 84.0314 29.792 82.9752 29.1045 81.668L24.542 72.9922C24.0451 72.0475 23.384 71.1986 22.5898 70.4854L15.3594 63.9922C14.2742 63.0177 13.52 61.7284 13.2031 60.3047L12.5254 57.2588C12.2125 55.8523 12.3417 54.3833 12.8945 53.0527L16.7002 43.8936C17.1028 42.9244 17.3329 41.8922 17.3799 40.8438L17.8252 30.8975C17.8901 29.45 18.4027 28.0579 19.292 26.9141L21.1201 24.5635C22.0343 23.3877 23.2998 22.5332 24.7324 22.126L33.873 19.5283C34.9219 19.2302 35.9082 18.7444 36.7832 18.0938L44.4629 12.3828C45.6704 11.485 47.135 11 48.6396 11Z'

export type KnobSize = 'small' | 'large'

/* One drawing for every knob: a bigger knob is a render scale and never a
   different path, which is what the panel does where the oscillator frequency
   knobs are physically bigger than the levels around them. */
export const SIZE_SCALE: Record<KnobSize, number> = {
  small: 1,
  large: 1.3,
}
