/* What the selector dial is printed with: the tick marks, the six detents and
   where their labels sit, lifted verbatim from reference/artwork/OSC. 1 (1).svg.
   Only the grouping and the colour references are ours — do not redraw them.

   The knob that turns inside it is KNOB 5, the same body as every other knob on
   the panel, so the rings and pointer this export was drawn with are not here.

   Taken from the spoke endpoints in the export rather than assumed: all six
   sit at radius 45.5 from the centre, 30° apart. Independently matches the
   geometry recovered from the printed artwork in reference/measurements.md. */
export const CENTRE = { x: 59.6512, y: 58.9985 }
export const DETENT_ANGLES = [-75, -45, -15, 15, 45, 75] as const
export const TICK_RADIUS = 45.5
export const LABEL_RADIUS = 58

/* The export is cropped tight to the waveform marks. Text labels are set from the
   centre of the detent and run wider than a glyph does — "LO" and "2'" overhang
   both ends — so the box is padded outward. Padding only; no artwork coordinate
   moves, so the paths stay exactly as drawn. */
export const VIEWBOX = { x: -16, y: -6, width: 150, height: 118 }

/* The six tick marks, fixed. One path in the export; kept as one. */
export const TICKS =
  'M59.6512 58.9985L27.4637 26.811M103.651 47.2086L59.6512 58.9985L15.6512 47.2088M59.6512 58.9985L47.9451 15.311M59.6512 58.9985L91.8387 26.8109M59.6512 58.9985L71.3572 15.3109'
