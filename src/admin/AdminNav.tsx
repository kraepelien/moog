import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { usePrivileges } from '@access/context.ts'
import { ADMIN_ROUTES, type RouteDef } from '@navigation/routes.ts'
import { TONE_COLOURS } from '@/tones.ts'
import styles from './AdminNav.module.css'

/* The administration pages are separate routes with separate privileges, so
   this shows only the ones this account can open — a link to a page that
   refuses is a door most people find locked. Nothing is drawn where there is
   only one to go to. */
export function AdminNav({
  here,
  onNavigate,
}: {
  here: RouteDef
  onNavigate: (path: string) => void
}) {
  const held = usePrivileges()
  const open = ADMIN_ROUTES.filter((route) => route.needs === undefined || held.has(route.needs))

  if (open.length < 2) return null

  return (
    <Box className={styles.nav}>
      {open.map((route) => {
        const on = route.name === here.name
        return (
          <Button
            key={route.name}
            size="small"
            className={styles.link}
            aria-current={on ? 'page' : undefined}
            onClick={() => onNavigate(route.path)}
            sx={{
              color: on ? '#0e0e11' : TONE_COLOURS.blue.ink,
              backgroundColor: on ? TONE_COLOURS.blue.ink : TONE_COLOURS.blue.field,
              '&:hover': {
                backgroundColor: on ? TONE_COLOURS.blue.ink : TONE_COLOURS.blue.strong,
              },
            }}
          >
            {route.title}
          </Button>
        )
      })}
    </Box>
  )
}
