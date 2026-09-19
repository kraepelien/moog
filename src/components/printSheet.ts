/* The paper the sheet is printed on, in one place because the stylesheet's
   `@page` and the scale computed in JS have to describe the same rectangle.

   Declared rather than recovered: "do not estimate geometry by eye" is about
   the instrument, whose dimensions come back out of the manual scans through
   tools/measure-artwork.py. A sheet of A4 is a choice, not a measurement. */

export const PAGE_SIZE = 'A4 landscape'
export const PAGE_WIDTH_MM = 297
export const PAGE_HEIGHT_MM = 210
export const PAGE_MARGIN_MM = 10

/* A CSS millimetre is 96/25.4 CSS pixels by definition, whatever resolution the
   printer works at, so this converts the page box rather than guessing at dots. */
const PX_PER_MM = 96 / 25.4

/* Both margins: the panel is laid out across the page, and subtracting one
   would print the right-hand sections into the gutter. */
export function printableWidthPx(): number {
  return (PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2) * PX_PER_MM
}

export function printableHeightPx(): number {
  return (PAGE_HEIGHT_MM - PAGE_MARGIN_MM * 2) * PX_PER_MM
}

/* One dimension at a time, so a panel that has to satisfy both is the smaller
   of two answers rather than a second function knowing about boxes.

   Capped at 1: a panel narrower than the page is printed at the size it is
   drawn, since blowing it up to fill the paper would print an instrument whose
   legends and dials are larger than the manual's own sheets draw them.

   No room left is not a scale of zero. It means the sheet has already given the
   panel away to something else, and the honest answer is to leave this
   dimension out of the decision rather than to print nothing. */
export function printScale(natural: number, available: number): number {
  if (natural <= 0 || available <= 0) return 1
  return Math.min(1, available / natural)
}
