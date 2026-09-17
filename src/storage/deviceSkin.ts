import { cleanSkin, type Skin } from '@/tones.ts'

/* Colours somebody is trying out, kept on their own machine and nowhere else.
 *
 * `sessionStorage` rather than `localStorage`: a preview that outlived the tab
 * would be a repaint with no beginning, found weeks later by somebody who no
 * longer remembers choosing it. This way it survives navigating around and a
 * reload — which is the whole point, since the app *is* the preview — and ends
 * when the tab does.
 *
 * The store is a parameter rather than `window.sessionStorage` reached for
 * here: Bun's runtime has no such global, so injecting it is what lets this be
 * driven by a fake instead of only in a browser.
 */

const KEY = 'moog:skin'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface DeviceSkin {
  read(): Skin
  /* False when the browser would not keep it, so the page can say so rather
     than losing the colours silently at the next reload. */
  write(skin: Skin): boolean
}

export function createDeviceSkin(storage: StorageLike | null): DeviceSkin {
  return {
    read() {
      let raw: string | null
      try {
        raw = storage?.getItem(KEY) ?? null
      } catch {
        /* Reading throws outright in a browser with site data blocked, so this
           is a probe and not a null check. */
        return {}
      }
      if (raw === null) return {}

      try {
        /* Sifted like a request body was, and for the same reason: this reaches
           `applySkin` before the first render, and anybody with a console open
           can put whatever they like in it. */
        return cleanSkin(JSON.parse(raw))
      } catch {
        return {}
      }
    },

    write(skin) {
      try {
        /* Removed rather than stored as `{}`, so going back to the defaults
           leaves nothing behind to read next time. */
        if (Object.keys(skin).length === 0) storage?.removeItem(KEY)
        else storage?.setItem(KEY, JSON.stringify(skin))
        return storage !== null
      } catch {
        return false
      }
    },
  }
}
