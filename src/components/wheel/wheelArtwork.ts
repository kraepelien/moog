/* Geometry lifted verbatim from reference/artwork/WHEEL.svg. Only the
   grouping and the colour references are ours.

   The ribs and the marker are both on the wheel's surface, so a value turns the
   whole surface rather than sliding a dot along a static one: everything shifts
   together and the ribs scroll past the frame. In the export the marker sits low
   on the wheel, near the bottom of its travel, which is what the drawn rib
   positions are relative to. */

export const VIEWBOX = { x: 0, y: 0, width: 52, height: 204 } as const

export const FRAME = { x: 10, y: 1, width: 32, height: 202 } as const
export const FACE = { x: 13.5, y: 4.5, width: 25, height: 195, rx: 7.5 } as const

export const RIB_X = 13.5
export const RIB_WIDTH = 25

/* The export draws eighteen bands, evenly pitched, with the two at the ends
   clipped short by the frame. Rather than listing them, the pattern is generated
   from that pitch: a turning wheel needs ribs arriving from beyond both ends,
   and a cylinder's surface repeats, so the two short bands come out of the
   clipping instead of being drawn as special cases. */
export const RIB_PITCH = 10
export const RIB_HEIGHT = 7
/* The top of one rib as the export draws it; every other rib is a whole number
   of pitches from it. */
export const RIB_BASE = 15.5

/* Where the ribs sit when the surface has turned by `shift` — enough of them to
   cover the face and no more, since the pattern repeats and anything further
   out is clipped away anyway. */
export function ribTops(shift: number): number[] {
  const wrapped = ((shift % RIB_PITCH) + RIB_PITCH) % RIB_PITCH
  const highest = FACE.y - RIB_HEIGHT
  const start = RIB_BASE + wrapped - Math.ceil((RIB_BASE + wrapped - highest) / RIB_PITCH) * RIB_PITCH
  const tops: number[] = []
  for (let y = start; y < FACE.y + FACE.height; y += RIB_PITCH) tops.push(y)
  return tops
}

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

/* How far the surface has turned from where the export drew it. The marker is
   part of that surface, so this is just its displacement — the ribs move with
   it, which is what makes the wheel read as turning rather than as a dot
   sliding down a ladder. */
export function surfaceShift(fraction: number): number {
  return markerY(fraction) - MARKER_BOTTOM
}
