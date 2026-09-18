import { useState, type MouseEvent, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import { usePrivileges } from '@access/context.ts'
import { ADMIN_ROUTES, HOME_ROUTE, RAIL, type RouteDef } from '@navigation/routes.ts'
import { AccountGlyph, CollapseGlyph, RouteGlyph, SettingsGlyph } from './railIcons.tsx'
import styles from './SideRail.module.css'

export interface RailAction {
  readonly label: string
  readonly onSelect: () => void
  /* Draws a rule above this item. */
  readonly separated?: boolean
}

function RailItem({
  label,
  title,
  glyph,
  on,
  collapsed,
  onSelect,
}: {
  /* The word under the glyph, dropped when the rail is folded. */
  label: string
  /* What the row is called to a reader, whether or not the word is drawn. */
  title: string
  glyph: ReactNode
  on: boolean
  collapsed: boolean
  onSelect: (event: MouseEvent<HTMLElement>) => void
}) {
  const item = (
    <ButtonBase
      className={styles.item}
      aria-label={title}
      aria-current={on ? 'page' : undefined}
      onClick={onSelect}
    >
      <Box component="span" className={styles.glyph}>
        {glyph}
      </Box>
      <Box component="span" className={styles.label}>
        {label}
      </Box>
    </ButtonBase>
  )

  /* Only once the word is gone. On an unfolded rail it would repeat what is
     already printed an inch away. */
  return collapsed ? (
    <Tooltip title={title} placement="right">
      {item}
    </Tooltip>
  ) : (
    item
  )
}

/* The app's navigation, down the left of every page.
 *
 * Folding it leaves the glyphs and takes the words, rather than taking the rail
 * away altogether: it is the only way to any page now that the tab strip is
 * gone, and a nav that can be dismissed entirely needs a second control to get
 * it back. */
export function SideRail({
  route,
  onNavigate,
  actions,
  collapsed,
  onCollapse,
}: {
  route: RouteDef
  onNavigate: (path: string) => void
  /* The account menu, opened from the last row. */
  actions: readonly RailAction[]
  collapsed: boolean
  onCollapse: (next: boolean) => void
}) {
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null)
  const held = usePrivileges()

  /* The first administration page this account can open, because the privileges
     are independent: somebody may keep the user list without holding the tag
     page Settings used to land on. Nothing is drawn when there is none. */
  const settings =
    ADMIN_ROUTES.find((entry) => entry.needs === undefined || held.has(entry.needs)) ?? null

  return (
    <Box
      component="nav"
      aria-label="Pages"
      className={styles.rail}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <Tooltip title={collapsed ? 'Show the page names' : 'Hide the page names'} placement="right">
        <ButtonBase
          className={styles.toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Show the page names' : 'Hide the page names'}
          onClick={() => onCollapse(!collapsed)}
        >
          <CollapseGlyph />
        </ButtonBase>
      </Tooltip>

      {/* The page's heading, and the way home — which is where a logo already
          takes everybody who presses one.

          The name goes with the rest of the words when the rail is folded: at
          60px the lockup would be the wordmark at eight pixels tall, which is a
          smudge rather than a name. Both drawings say PatchDB to a reader, so
          the heading reads the same either way. */}
      <h1 className={styles.mark}>
        <ButtonBase
          className={styles.home}
          aria-label={HOME_ROUTE.title}
          aria-current={route.name === HOME_ROUTE.name ? 'page' : undefined}
          onClick={() => onNavigate(HOME_ROUTE.path)}
        >
          <img
            src={collapsed ? '/logo.svg' : '/patchdb.svg'}
            alt="PatchDB"
            width={collapsed ? 34 : 68}
            height={collapsed ? 34 : 61}
            className={styles.logo}
          />
        </ButtonBase>
      </h1>

      <Box className={styles.group}>
        {RAIL.map((entry) => (
          <RailItem
            key={entry.name}
            label={entry.rail!}
            title={entry.title}
            glyph={<RouteGlyph route={entry.name} />}
            on={entry.name === route.name}
            collapsed={collapsed}
            onSelect={() => onNavigate(entry.path)}
          />
        ))}
      </Box>

      <Box className={styles.foot}>
        {settings !== null && (
          <RailItem
            label="Settings"
            title="Administration"
            glyph={<SettingsGlyph />}
            on={route.path.startsWith('/admin')}
            collapsed={collapsed}
            onSelect={() => onNavigate(settings.path)}
          />
        )}

        <RailItem
          label="Account"
          title="Account and file actions"
          glyph={<AccountGlyph />}
          on={menuAt !== null}
          collapsed={collapsed}
          /* Anchored on the row itself rather than on the rail, so the menu
             opens beside what was pressed however far down the rail it is. */
          onSelect={(event) => setMenuAt(event.currentTarget)}
        />
      </Box>

      <Menu
        anchorEl={menuAt}
        open={menuAt !== null}
        onClose={() => setMenuAt(null)}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
      >
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
    </Box>
  )
}
