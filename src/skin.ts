import { DEFAULT_SKIN, SKIN_SWATCHES, type Skin } from '@/tones.ts'

/* Painting a previewed skin onto the document.
 *
 * Custom properties on :root rather than a theme object, for three reasons that
 * all come to the same thing: nothing has to be told. MUI's chrome, the CSS
 * modules and the inline styles all read the same properties, a repaint is one
 * write per colour with no re-render, and a component can go on asking for
 * `SHELL.card` without knowing a skin exists.
 *
 * A key a skin leaves out is *removed* rather than left as it was, so putting a
 * colour back to the default is the same operation as setting one, and the
 * stylesheet underneath is what the page then shows.
 */

export function applySkin(skin: Skin, root: HTMLElement): void {
  for (const swatch of SKIN_SWATCHES) {
    const chosen = skin[swatch.key]
    if (chosen === undefined) root.style.removeProperty(swatch.property)
    else root.style.setProperty(swatch.property, chosen)
  }
}

/* What a field starts at: the skin's answer, or the stylesheet's. A colour
   input has no empty state — it is always showing some colour — so it has to be
   given the one the app is actually drawing with. */
export function skinValue(skin: Skin, key: string): string {
  return skin[key] ?? DEFAULT_SKIN[key]!
}
