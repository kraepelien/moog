import type { ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import { useCan, usePrivileges } from './context.ts'
import type { Privilege } from './privileges.ts'

/* Two guards over the same question.

   `Can` hides a control somebody may not use. Hiding is a courtesy — the route
   behind it refuses regardless — so it renders nothing by default rather than a
   refusal: a button that is not for you is best simply absent. */
export function Can({
  privilege,
  children,
  otherwise = null,
}: {
  privilege: Privilege
  children: ReactNode
  otherwise?: ReactNode
}) {
  return <>{useCan(privilege) ? children : otherwise}</>
}

/* `RouteGuard` stands in front of a whole page, which is reachable by typing
   its address. That one says no out loud: arriving at a page and being shown an
   empty list whose every button is refused reads as a broken page rather than a
   closed door. */
export function RouteGuard({
  privilege,
  title,
  children,
}: {
  privilege: Privilege | undefined
  title: string
  children: ReactNode
}) {
  const held = usePrivileges()
  if (privilege === undefined || held.has(privilege)) return <>{children}</>

  return (
    <Alert severity="warning">
      <AlertTitle>{title}</AlertTitle>
      This page is not for this account.
    </Alert>
  )
}
