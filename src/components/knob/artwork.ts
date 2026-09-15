/* Paths lifted verbatim from the hand-drawn export "OSC. 1 (1).svg". Only the
   grouping and the colour references are ours — do not redraw them.

   The export is drawn with the knob turned to −15°, the fourth detent. Rendering
   a different position rotates the body group by (angle + BAKED_ANGLE); nothing
   here is re-pathed. */

export const BAKED_ANGLE = -15

/* Taken from the spoke endpoints in the export rather than assumed: all six sit
   at radius 45.5 from the centre, 30° apart. Independently matches the geometry
   recovered from the printed artwork in reference/measurements.md. */
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

/* Everything that turns with the knob. The two rings and the cap are circular, so
   rotating them is invisible; they are in the group anyway so the assembly stays
   one thing rather than four with separate transforms. */
export const OUTER_RING =
  'M88.6691 83.851C96.4217 74.6675 99.7027 61.9645 96.3564 49.4759C90.9246 29.2041 70.0878 17.174 49.8161 22.6058C29.5444 28.0376 17.5142 48.8744 22.946 69.1461C26.2923 81.6347 35.4853 90.9954 46.791 95.0723L88.6691 83.851Z'

export const INNER_RING =
  'M50.8118 26.2704C68.9496 21.4103 87.5931 32.1741 92.4531 50.312C95.4185 61.3789 92.5657 72.632 85.769 80.8319L47.8187 91.0007C37.8326 87.2977 29.7355 78.9786 26.7701 67.9117C21.9101 49.7738 32.6739 31.1304 50.8118 26.2704Z'

export const POINTER =
  'M49.4496 20.923C50.821 20.5555 52.4861 20.1006 53.9959 20.1224C54.793 20.1339 55.6542 20.2756 56.4746 20.6947C57.3164 21.1246 57.9979 21.7871 58.5012 22.6549C59.8546 24.9888 78.7608 59.2101 89.8366 76.5359C90.6716 77.8421 91.0667 79.1782 91.0268 80.5138C90.9874 81.8324 90.5299 82.9848 89.9327 83.9502C88.794 85.7909 86.9204 87.2733 85.7498 88.2506C83.7844 89.8917 82.2212 90.8846 80.7408 91.2145C79.0791 91.5846 77.8385 91.047 76.9495 90.6562C76.0841 90.2757 75.3359 89.9233 74.1153 89.7869C72.871 89.6479 71.014 89.7282 68.0954 90.5102C65.1768 91.2923 63.5285 92.1512 62.5204 92.8937C61.5314 93.6222 61.0597 94.3015 60.5005 95.0637C59.926 95.8467 59.1205 96.9326 57.4963 97.4428C56.0493 97.8973 54.1992 97.819 51.6764 97.3806C50.1741 97.1194 47.8103 96.7725 45.9038 95.7477C44.9039 95.2102 43.9314 94.441 43.238 93.3188C42.5357 92.1821 42.2098 90.8274 42.2798 89.2787C43.2088 68.7362 42.4724 29.6464 42.4776 26.9484C42.4795 25.9453 42.7376 25.031 43.2516 24.2378C43.7525 23.4646 44.4275 22.9113 45.112 22.5028C46.4087 21.729 48.0781 21.2905 49.4496 20.923Z'

export const CAP = { cx: 59.6786, cy: 59.3618, r: 20 }
