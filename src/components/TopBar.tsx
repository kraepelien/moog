import { useState, type ReactNode } from 'react'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import type { View } from '../navigation.ts'
import styles from './TopBar.module.css'

/* Three lines. An icon font or a whole icon package for one glyph is a
   dependency to keep up to date for the sake of a shape that is three lines. */
function MenuGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  )
}

export interface TopBarAction {
  readonly label: string
  readonly onSelect: () => void
  /* Drawn as a rule above this item, for the ones that are a different kind of
     thing from the ones before. */
  readonly separated?: boolean
}

export function TopBar({
  view,
  onView,
  actions,
  children,
}: {
  view: View
  onView: (view: View) => void
  actions: readonly TopBarAction[]
  /* Anything the page wants beside the navigation — a count, a status. */
  children?: ReactNode
}) {
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null)

  return (
    <AppBar position="sticky">
      <Toolbar variant="dense" className={styles.bar}>
        <img src="/logo.png" alt="" width="28" height="28" className={styles.logo} />
        <Typography variant="subtitle1" component="h1" className={styles.title}>
          Minimoog Model D
        </Typography>

        <Box className={styles.spacer}>{children}</Box>

        <ToggleButtonGroup
          exclusive
          size="small"
          value={view}
          onChange={(_event, next: View | null) => next && onView(next)}
          aria-label="Page"
        >
          <ToggleButton value="editor">Editor</ToggleButton>
          <ToggleButton value="library">Library</ToggleButton>
        </ToggleButtonGroup>

        <IconButton
          edge="end"
          color="inherit"
          aria-label="Menu"
          onClick={(event) => setMenuAt(event.currentTarget)}
        >
          <MenuGlyph />
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
