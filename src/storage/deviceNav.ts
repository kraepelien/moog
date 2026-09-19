import type { StorageLike } from './deviceSkin.ts'

/* Where the navigation is asked to sit, kept on the machine it was asked on.
 *
 * `localStorage` for the same reason the folded rail uses it: this is how
 * somebody wants their window laid out, not something they are in the middle of
 * trying.
 *
 * Only the choice is kept, never what is on the screen. A narrow window puts the
 * bar across the top whatever is stored here, so writing "rail" on a phone would
 * be recording a layout it cannot have.
 */

const KEY = 'pm:nav-top'

/* `window` is the rail on a wide screen and the bar on a narrow one; `top` is
   the bar everywhere. */
export type NavPreference = 'window' | 'top'

export interface DeviceNav {
  read(): NavPreference
  write(preference: NavPreference): void
}

export function createDeviceNav(storage: StorageLike | null): DeviceNav {
  return {
    read() {
      try {
        /* Reading throws outright in a browser with site data blocked, so this
           is a probe and not a null check. Anything but the one word this
           writes is a nav that follows the window, which is what a first visit
           gets. */
        return storage?.getItem(KEY) === 'top' ? 'top' : 'window'
      } catch {
        return 'window'
      }
    },

    write(preference) {
      try {
        /* Removed rather than stored as "window", so a nav left to follow the
           window leaves nothing behind to read next time. */
        if (preference === 'top') storage?.setItem(KEY, 'top')
        else storage?.removeItem(KEY)
      } catch {
        /* A browser that will not keep it still moves the nav for as long as the
           page is up. */
      }
    },
  }
}
