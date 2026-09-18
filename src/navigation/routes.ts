import { PRIVILEGE, type Privilege } from '@access/privileges.ts'

/* The pages, and what each one needs. One table, so a page that should be
   behind a privilege is behind it by being written down here rather than by
   whoever adds it remembering to check.

   The address still lives in the fragment. A fragment already survives a
   reload and works with the back button, and moving to real paths would drag
   every OAuth return URL with it for a cosmetic gain on an app that is behind
   a sign-in anyway. Only `read` below knows, so that change stays one function
   wide when it is worth making. */

export interface RouteDef {
  readonly name: string
  /* Segments, with `:name` capturing one. */
  readonly path: string
  readonly title: string
  /* What this page is called in the side rail, and whether it is in it at all.
     A page without one is reached some other way — the account menu, or the
     mark at the top of the rail: a row everybody could see would be a door most
     people find locked.

     A word of its own rather than the title, because the rail is as wide as its
     widest label and "Patch library" over two lines is what that costs. The
     title is still what the row is named to a reader. */
  readonly rail?: string
  readonly needs?: Privilege
}

export const ROUTES: readonly RouteDef[] = [
  /* Not a row of its own: the mark at the top of the rail goes here, which is
     where a logo already takes everybody who presses one. */
  { name: 'home', path: '/', title: 'Home' },
  { name: 'library', path: '/library', title: 'Patch library', rail: 'Library' },
  { name: 'editor', path: '/editor', title: 'Patch editor', rail: 'Editor' },
  { name: 'midi', path: '/midi', title: 'Play MIDI', rail: 'MIDI' },
  { name: 'admin', path: '/admin', title: 'Tags', needs: PRIVILEGE.AccessAdmin },
  /* Its own privilege rather than nesting behind AccessAdmin, so the two can be
     held apart — which is what the rules protecting this page assume. */
  { name: 'layout', path: '/admin/layout', title: 'Layout', needs: PRIVILEGE.AdminLayout },
  { name: 'users', path: '/admin/users', title: 'People', needs: PRIVILEGE.AdminUsers },
]

/* The administration area's own pages, for the nav inside it. */
export const ADMIN_ROUTES: readonly RouteDef[] = ROUTES.filter((route) =>
  route.path.startsWith('/admin'),
)

/* Where the mark at the top of the rail goes. Named rather than reached through
   `DEFAULT_ROUTE`, which is the same page for a different reason: one is where
   the logo leads and the other is where an address naming no page lands, and
   the day they stop being the same page neither should have to be found again. */
export const HOME_ROUTE: RouteDef = ROUTES.find((entry) => entry.name === 'home')!

/* Named rather than taken from the head of the list: the rail is in the order
   it is read in, and an address naming no page still lands on the home page. */
export const DEFAULT_ROUTE: RouteDef = HOME_ROUTE

export const RAIL: readonly RouteDef[] = ROUTES.filter((entry) => entry.rail !== undefined)

export interface Match {
  readonly route: RouteDef
  readonly params: Readonly<Record<string, string>>
}

export function matchRoute(route: RouteDef, path: string): Match | null {
  const segments = path.split('/').filter(Boolean)
  const wanted = route.path.split('/').filter(Boolean)
  if (wanted.length !== segments.length) return null

  const params: Record<string, string> = {}
  for (const [index, part] of wanted.entries()) {
    const given = segments[index]!
    if (part.startsWith(':')) {
      params[part.slice(1)] = decodeURIComponent(given)
      continue
    }
    if (part !== given) return null
  }
  return { route, params }
}

/* An address naming no page is the home page rather than an error page: the only
   way to reach one is to type it, and there is nothing useful to say.

   The query is cut off first: it belongs to whoever reads it — a sign-in that
   came back with `?error=` — and never to the match, which is about segments. */
export function resolve(path: string): Match {
  const segments = path.split(/[?#]/)[0]!
  for (const route of ROUTES) {
    const found = matchRoute(route, segments)
    if (found) return found
  }
  return { route: DEFAULT_ROUTE, params: {} }
}

export function pathFor(name: string, params: Readonly<Record<string, string>> = {}): string {
  const route = ROUTES.find((entry) => entry.name === name) ?? DEFAULT_ROUTE
  const built = route.path
    .split('/')
    .filter(Boolean)
    .map((part) => (part.startsWith(':') ? encodeURIComponent(params[part.slice(1)] ?? '') : part))
    .reduce((path, part) => `${path}/${part}`, '')
  /* The home page has no segments, and an empty string is not an address
     `pushState` can be given. */
  return built === '' ? '/' : built
}
