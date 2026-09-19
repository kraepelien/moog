import { useState, type MouseEvent, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import { usePrivileges } from '@access/context.ts'
import { ADMIN_ROUTES, HOME_ROUTE, RAIL, type RouteDef } from '@navigation/routes.ts'
import type { NavPlacement } from './navPlacement.ts'
import { AccountGlyph, CollapseGlyph, RouteGlyph, SettingsGlyph } from './railIcons.tsx'
import styles from './PageNav.module.css'

export interface NavAction {
  readonly label: string
  readonly onSelect: () => void
  /* Draws a rule above this item. */
  readonly separated?: boolean
}

function NavItem({
  label,
  title,
  glyph,
  on,
  named,
  placement,
  onSelect,
}: {
  /* The word beside or under the glyph, dropped when there is no room for it. */
  label: string
  /* What the row is called to a reader, whether or not the word is drawn. */
  title: string
  glyph: ReactNode
  on: boolean
  /* Whether the word is certainly drawn. */
  named: boolean
  placement: NavPlacement
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

  /* Only where the word may be gone. Beside a word that is printed an inch away
     it would only repeat it, which is why the unfolded rail has none. The bar
     keeps its tooltips either way: the stylesheet, not this component, is what
     takes the words off a narrow one, so nothing here knows whether they are
     still there. */
  return named ? (
    item
  ) : (
    <Tooltip title={title} placement={placement === 'rail' ? 'right' : 'bottom'}>
      {item}
    </Tooltip>
  )
}

/* The app's navigation: down the left of every page, or across the top of it.
 *
 * One component for both because it is one nav: the same rows, in the same
 * order, marking the same page. Which way it is laid out is the placement, and
 * the stylesheet does the turning.
 *
 * Folding it leaves the glyphs and takes the words, rather than taking the rail
 * away altogether: it is the only way to any page now that the tab strip is
 * gone, and a nav that can be dismissed entirely needs a second control to get
 * it back. The bar does not fold: it is already a glyph tall, and a narrow one
 * drops its words on its own. */
export function PageNav({
  route,
  onNavigate,
  actions,
  placement,
  collapsed,
  onCollapse,
}: {
  route: RouteDef
  onNavigate: (path: string) => void
  /* The account menu, opened from the last row. */
  actions: readonly NavAction[]
  placement: NavPlacement
  collapsed: boolean
  onCollapse: (next: boolean) => void
}) {
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null)
  const held = usePrivileges()
  const rail = placement === 'rail'
  /* The bar's words go with the window's width rather than with anything that
     was pressed, so only the rail's rows are ever certainly named. */
  const named = rail && !collapsed

  /* The first administration page this account can open, because the privileges
     are independent: somebody may keep the user list without holding the tag
     page Admin used to land on. Nothing is drawn when there is none. */
  const admin =
    ADMIN_ROUTES.find((entry) => entry.needs === undefined || held.has(entry.needs)) ?? null

  return (
    <Box
      component="nav"
      aria-label="Pages"
      className={styles.nav}
      data-print="off"
      data-placement={placement}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      {/* Nothing to fold on the bar: its rows are a glyph and a word on one
          line, and the line has to be there. */}
      {rail && (
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
      )}

      {/* The page's heading, and the way home — which is where a logo already
          takes everybody who presses one.

          The name goes with the rest of the words when the rail is folded: at
          60px the lockup would be the wordmark at eight pixels tall, which is a
          smudge rather than a name. The bar is shorter still, so it takes the
          tile for the same reason without waiting to be folded. Both drawings
          say PatchDB to a reader, so the heading reads the same either way. */}
      <h1 className={styles.mark}>
        <ButtonBase
          className={styles.home}
          aria-label={HOME_ROUTE.title}
          aria-current={route.name === HOME_ROUTE.name ? 'page' : undefined}
          onClick={() => onNavigate(HOME_ROUTE.path)}
        >
          <img
            src={named ? '/patchdb.svg' : '/logo.svg'}
            alt="PatchDB"
            width={named ? 68 : 34}
            height={named ? 61 : 34}
            className={styles.logo}
          />
        </ButtonBase>
      </h1>

      <Box className={styles.group}>
        {RAIL.map((entry) => (
          <NavItem
            key={entry.name}
            label={entry.rail!}
            title={entry.title}
            glyph={<RouteGlyph route={entry.name} />}
            on={entry.name === route.name}
            named={named}
            placement={placement}
            onSelect={() => onNavigate(entry.path)}
          />
        ))}
      </Box>

      <Box className={styles.foot}>
        {admin !== null && (
          <NavItem
            label="Admin"
            title="Administration"
            glyph={<SettingsGlyph />}
            on={route.path.startsWith('/admin')}
            named={named}
            placement={placement}
            onSelect={() => onNavigate(admin.path)}
          />
        )}

        <NavItem
          label="Account"
          title="Account and file actions"
          glyph={<AccountGlyph />}
          on={menuAt !== null}
          named={named}
          placement={placement}
          /* Anchored on the row itself rather than on the nav, so the menu opens
             beside what was pressed however far along it is. */
          onSelect={(event) => setMenuAt(event.currentTarget)}
        />
      </Box>

      <Menu
        anchorEl={menuAt}
        open={menuAt !== null}
        onClose={() => setMenuAt(null)}
        /* Out of the nav the way the nav runs: beside the row on the rail, under
           it on the bar, where there is nothing below to cover. */
        anchorOrigin={
          rail ? { vertical: 'center', horizontal: 'right' } : { vertical: 'bottom', horizontal: 'right' }
        }
        transformOrigin={
          rail ? { vertical: 'center', horizontal: 'left' } : { vertical: 'top', horizontal: 'right' }
        }
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
