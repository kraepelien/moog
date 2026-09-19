import type { StorageLike } from './deviceSkin.ts'

/* Whether the side rail is folded, kept on the machine it was folded on.
 *
 * `localStorage` rather than the `sessionStorage` a previewed skin uses: this is
 * how somebody wants their window laid out, not something they are in the middle
 * of trying, and a rail that sprang back open every time a tab was opened would
 * read as the control not working.
 *
 * The store is a parameter for the same reason it is there: Bun's runtime has no
 * such global, so injecting it is what lets this be driven by a fake instead of
 * only in a browser.
 */

const KEY = 'pm:rail-collapsed'

export interface DeviceRail {
  read(): boolean
  write(collapsed: boolean): void
}

export function createDeviceRail(storage: StorageLike | null): DeviceRail {
  return {
    read() {
      try {
        /* Reading throws outright in a browser with site data blocked, so this
           is a probe and not a null check. Anything but the one word this
           writes is an unfolded rail, which is what a first visit gets. */
        return storage?.getItem(KEY) === 'collapsed'
      } catch {
        return false
      }
    },

    write(collapsed) {
      try {
        /* Removed rather than stored as "open", so a rail left unfolded leaves
           nothing behind to read next time. */
        if (collapsed) storage?.setItem(KEY, 'collapsed')
        else storage?.removeItem(KEY)
      } catch {
        /* A browser that will not keep it still folds the rail for as long as
           the page is up; there is nothing to tell anybody about that a colour
           scheme quietly reverting would not also need. */
      }
    },
  }
}
