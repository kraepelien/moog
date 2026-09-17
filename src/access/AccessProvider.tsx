import { useMemo, type ReactNode } from 'react'
import { AccessContext } from './context.ts'
import { isPrivilege } from './privileges.ts'

/* Unknown names are dropped rather than kept as strings: a server one version
   ahead may name a privilege this build has never heard of, and `can()` should
   answer no for it rather than compare against something it cannot represent. */
export function AccessProvider({
  privileges,
  children,
}: {
  privileges: readonly string[]
  children: ReactNode
}) {
  const held = useMemo(() => new Set(privileges.filter(isPrivilege)), [privileges])
  return <AccessContext.Provider value={held}>{children}</AccessContext.Provider>
}
