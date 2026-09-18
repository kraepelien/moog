import { useSyncExternalStore } from 'react'
import type { NavPreference } from '@storage/deviceNav.ts'

/* Where the navigation is drawn: down the left, or across the top.
 *
 * A window this narrow cannot spare 96px of its width for a rail, so the bar
 * goes on top whatever anybody has chosen: the choice is between the rail on a
 * wide screen and the bar everywhere, not between the rail and a window with no
 * room for one.
 *
 * The one width in the app that decides this. What the stylesheet keys off is
 * the placement rather than a second copy of the number; its own query, further
 * down, is about a bar that is already up.
 */
export const NARROW = '(max-width: 899px)'

export type NavPlacement = 'rail' | 'top'

function subscribe(changed: () => void): () => void {
  const query = window.matchMedia(NARROW)
  query.addEventListener('change', changed)
  return () => query.removeEventListener('change', changed)
}

export function useNavPlacement(preference: NavPreference): NavPlacement {
  /* Read rather than kept in state, so the first render already knows: a rail
     that appeared for one frame on a phone would be the page reflowing under
     somebody's thumb. */
  const narrow = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(NARROW).matches,
    () => false,
  )
  return preference === 'top' || narrow ? 'top' : 'rail'
}
