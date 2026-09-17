import { useState, type ReactNode } from 'react'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Toolbar from '@mui/material/Toolbar'
import { usePrivileges } from '../access/context.ts'
import { TABS, type RouteDef } from '../navigation/routes.ts'
import styles from './TopBar.module.css'

/* Inline rather than an icon package, for a shape that is a head and a pair of
   shoulders. */
function PersonGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path
        d="M5 19.5c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

export interface TopBarAction {
  readonly label: string
  readonly onSelect: () => void
  /* Draws a rule above this item. */
  readonly separated?: boolean
}

export function TopBar({
  route,
  onNavigate,
  actions,
  children,
}: {
  route: RouteDef
  onNavigate: (path: string) => void
  actions: readonly TopBarAction[]
  children?: ReactNode
}) {
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null)
  const held = usePrivileges()
  /* A tab for a page this account cannot open would be a door most people find
     locked; the page behind it still refuses on its own. */
  const tabs = TABS.filter((tab) => tab.needs === undefined || held.has(tab.needs))

  return (
    <AppBar position="sticky">
      <Toolbar variant="dense" className={styles.bar}>
        {/* The page's heading is the instrument, and the mark says it without
            spending the bar's width on words the nav already carries. */}
        <h1 className={styles.mark}>
          <img src="/logo.png" alt="Minimoog Model D" width="28" height="28" className={styles.logo} />
        </h1>

        <Tabs
          /* False on a page without a tab, which leaves the row unselected
             rather than pointing at whichever tab sorts first. */
          value={tabs.some((tab) => tab.name === route.name) ? route.path : false}
          onChange={(_event, next: string) => onNavigate(next)}
          aria-label="Page"
          className={styles.tabs}
        >
          {tabs.map((tab) => (
            <Tab key={tab.name} value={tab.path} label={tab.title} className={styles.tab} />
          ))}
        </Tabs>

        <Box className={styles.spacer}>{children}</Box>

        <IconButton
          edge="end"
          color="inherit"
          aria-label="Account and file actions"
          onClick={(event) => setMenuAt(event.currentTarget)}
        >
          <PersonGlyph />
        </IconButton>

        <Menu anchorEl={menuAt} open={menuAt !== null} onClose={() => setMenuAt(null)}>
          {actions.map((action) => [
            action.separated ? <Divider key={`${action.label}-rule`} /> : null,
            <MenuItem
              key={action.label}
              onClick={() => {
                setMenuAt(null)
                action.onSelect()
              }}
            >
              {action.label}
            </MenuItem>,
          ])}
        </Menu>
      </Toolbar>
    </AppBar>
  )
}
