/* Geometry lifted verbatim from reference/artwork/WHEEL.svg. Only the
   grouping and the colour references are ours.

   The ribs are the wheel's surface and do not move; the circle is the marker,
   and it is the only thing a value changes. In the export it sits low on the
   wheel, near the bottom of its travel. */

export const VIEWBOX = { x: 0, y: 0, width: 52, height: 204 } as const

export const FRAME = { x: 10, y: 1, width: 32, height: 202 } as const
export const FACE = { x: 13.5, y: 4.5, width: 25, height: 195, rx: 7.5 } as const

export const RIB_X = 13.5
export const RIB_WIDTH = 25

/* Eighteen bands, the two at the ends thinner than the rest. */
export const RIBS: readonly { readonly y: number; readonly height: number }[] = [
  { y: 12.5, height: 3 },
  { y: 15.5, height: 7 },
  { y: 25.5, height: 7 },
  { y: 35.5, height: 7 },
  { y: 45.5, height: 7 },
  { y: 55.5, height: 7 },
  { y: 65.5, height: 7 },
  { y: 75.5, height: 7 },
  { y: 85.5, height: 7 },
  { y: 95.5, height: 7 },
  { y: 105.5, height: 7 },
  { y: 115.5, height: 7 },
  { y: 125.5, height: 7 },
  { y: 135.5, height: 7 },
  { y: 145.5, height: 7 },
  { y: 155.5, height: 7 },
  { y: 165.5, height: 7 },
  { y: 172.5, height: 3 },
]

export const MARKER = { cx: 26, radius: 7 } as const

/* Where the marker can travel. Taken from its drawn position — 187, near the
   bottom — mirrored about the centre of the face, so the two ends are
   symmetrical and the export sits exactly at the minimum. */
export const MARKER_BOTTOM = 187
export const MARKER_CENTRE = FACE.y + FACE.height / 2
export const MARKER_TOP = MARKER_CENTRE - (MARKER_BOTTOM - MARKER_CENTRE)

export const MARKER_TRAVEL = MARKER_BOTTOM - MARKER_TOP

/* Fraction of travel (0 at the bottom, 1 at the top) to a y coordinate. */
export function markerY(fraction: number): number {
  return MARKER_BOTTOM - fraction * MARKER_TRAVEL
}
