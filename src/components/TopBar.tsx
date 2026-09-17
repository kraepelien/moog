import { useState, type ReactNode } from 'react'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { usePrivileges } from '@access/context.ts'
import { TABS, type RouteDef } from '@navigation/routes.ts'
import { TONE_COLOURS, type Tone } from '@/tones.ts'
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

function KnobGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M12 12V5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function ListGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      {[7, 12, 17].map((y) => (
        <g key={y}>
          <circle cx="5.2" cy={y} r="1.2" fill="currentColor" />
          <path d={`M9.5 ${y}h9.3`} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  )
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        d="M9.2 6.6 18 12l-8.8 5.4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

/* A tab costs a glyph's width rather than its title's, which is what leaves the
   middle of the bar for the patch and the end of it for the buttons. A page
   with no glyph keeps its words: a blank square is worse than a long tab. */
const TAB_GLYPHS: Readonly<Record<string, ReactNode>> = {
  editor: <KnobGlyph />,
  library: <ListGlyph />,
  midi: <PlayGlyph />,
}

/* Whether what is on the panel has been written down. Green is the whole of the
   feedback a save gives — there is no notification any more — so it has to be
   the resting state of a saved patch rather than a flash that is gone by the
   time anybody looks up. Amber is the other half of the same signal, and both
   are away from the white the rest of the bar is set in. */
const TITLE_TONE: Record<'saved' | 'unsaved', Tone> = {
  saved: 'green',
  unsaved: 'amber',
}

export interface TopBarAction {
  readonly label: string
  readonly onSelect: () => void
  /* Draws a rule above this item. */
  readonly separated?: boolean
}

export interface TopBarButton {
  readonly label: string
  readonly tone: Tone
  readonly onSelect: () => void
  readonly disabled?: boolean
}

export function TopBar({
  route,
  onNavigate,
  actions,
  title,
  buttons = [],
  children,
}: {
  route: RouteDef
  onNavigate: (path: string) => void
  actions: readonly TopBarAction[]
  /* What the page has open, named in the middle of the bar. Only the editor
     holds something that can be edited, so only the editor passes one. */
  title?: { readonly text: string; readonly unsaved: boolean }
  /* What can be done to it, at the end of the bar rather than in a row of its
     own above the panel. */
  buttons?: readonly TopBarButton[]
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
        <Box className={styles.nav}>
          {/* The page's heading is the instrument, and the mark says it without
              spending the bar's width on words the nav already carries. */}
          <h1 className={styles.mark}>
            <img
              src="/logo.png"
              alt="Minimoog Model D"
              width="28"
              height="28"
              className={styles.logo}
            />
          </h1>

          <Tabs
            /* False on a page without a tab, which leaves the row unselected
               rather than pointing at whichever tab sorts first. */
            value={tabs.some((tab) => tab.name === route.name) ? route.path : false}
            onChange={(_event, next: string) => onNavigate(next)}
            aria-label="Page"
            className={styles.tabs}
          >
            {tabs.map((tab) => {
              const glyph = TAB_GLYPHS[tab.name]
              return (
                <Tab
                  key={tab.name}
                  value={tab.path}
                  className={styles.tab}
                  /* Named whether or not it is printed: the rest of the strip is
                     a picture until you are standing on it. */
                  aria-label={tab.title}
                  icon={
                    glyph === undefined ? undefined : (
                      <Tooltip title={tab.title}>
                        <span className={styles.glyph}>{glyph}</span>
                      </Tooltip>
                    )
                  }
                  iconPosition="start"
                  label={glyph === undefined || tab.name === route.name ? tab.title : ''}
                />
              )
            })}
          </Tabs>

          <Tooltip title="Account and file actions">
            <IconButton
              color="inherit"
              className={styles.account}
              aria-label="Account and file actions"
              onClick={(event) => setMenuAt(event.currentTarget)}
            >
              <PersonGlyph />
            </IconButton>
          </Tooltip>

          {children}
        </Box>

        {title !== undefined && (
          <Typography
            component="h2"
            className={styles.title}
            sx={{ color: TONE_COLOURS[TITLE_TONE[title.unsaved ? 'unsaved' : 'saved']].ink }}
          >
            {title.text || '(unnamed)'}
          </Typography>
        )}

        <Box className={styles.buttons}>
          {buttons.map((button) => (
            <Button
              key={button.label}
              size="small"
              disabled={button.disabled}
              className={styles.button}
              onClick={button.onSelect}
              sx={{
                color: TONE_COLOURS[button.tone].ink,
                backgroundColor: TONE_COLOURS[button.tone].field,
                '&:hover': { backgroundColor: TONE_COLOURS[button.tone].strong },
              }}
            >
              {button.label}
            </Button>
          ))}
        </Box>
      </Toolbar>

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
    </AppBar>
  )
}
