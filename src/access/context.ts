import { createContext, useContext } from 'react'
import type { Privilege } from './privileges.ts'

/* What this browser has been told it may do, put where any component can ask.

   Told, not decided: the list arrives from /api/session and every route checks
   again on its own. A component reading this is choosing what to draw, and a
   tampered-with list buys nothing but a button that returns 403. */

export const AccessContext = createContext<ReadonlySet<Privilege>>(new Set())

export function usePrivileges(): ReadonlySet<Privilege> {
  return useContext(AccessContext)
}

export function useCan(privilege: Privilege): boolean {
  return useContext(AccessContext).has(privilege)
}
