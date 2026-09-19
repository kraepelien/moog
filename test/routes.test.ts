import { describe, expect, test } from 'bun:test'
import { PRIVILEGE } from '@access/privileges.ts'
import {
  DEFAULT_ROUTE,
  matchRoute,
  pathFor,
  RAIL,
  resolve,
  ROUTES,
} from '@navigation/routes.ts'

describe('resolving an address', () => {
  test('finds the page it names', () => {
    expect(resolve('/library').route.name).toBe('library')
    expect(resolve('/admin').route.name).toBe('admin')
  })

  /* The only way to reach one is to type it, and there is nothing useful an
     error page could say that the home page does not. */
  test('falls back to the default rather than to an error page', () => {
    expect(resolve('/nowhere').route).toBe(DEFAULT_ROUTE)
    expect(resolve('').route).toBe(DEFAULT_ROUTE)
    expect(resolve('/library/extra').route).toBe(DEFAULT_ROUTE)
  })

  /* The home page's path is no segments at all, which every other route in the
     table has at least one of. */
  test('finds the home page at the root', () => {
    expect(resolve('/').route.name).toBe('home')
  })
})

/* The patch page is the one route with a parameter, so this exercises the real
   row rather than a stand-in. */
describe('matching a page that takes a parameter', () => {
  const patch = ROUTES.find((route) => route.name === 'patch')!

  test('captures the segment under the name the path gave it', () => {
    expect(matchRoute(patch, '/patch/abc-123')?.params).toEqual({ id: 'abc-123' })
  })

  test('decodes it, because it arrived through an address', () => {
    expect(matchRoute(patch, '/patch/a%2Fb')?.params).toEqual({ id: 'a/b' })
  })

  test('does not match a different depth', () => {
    expect(matchRoute(patch, '/patch')).toBeNull()
    expect(matchRoute(patch, '/patch/abc/extra')).toBeNull()
  })

  test('resolves a real address to it, slug or uid alike', () => {
    expect(resolve('/patch/midnight-funk').route.name).toBe('patch')
    expect(resolve('/patch/midnight-funk').params).toEqual({ id: 'midnight-funk' })
  })

  /* Round trips, which is what a link somebody was sent depends on. */
  test('builds an address a space survives', () => {
    expect(pathFor('patch', { id: 'a b' })).toBe('/patch/a%20b')
    expect(resolve(pathFor('patch', { id: 'a b' })).params).toEqual({ id: 'a b' })
  })
})

describe('building an address', () => {
  test('gives the path a page is reached at', () => {
    expect(pathFor('admin')).toBe('/admin')
    expect(pathFor('midi')).toBe('/midi')
  })

  /* Reducing no segments gives an empty string, which `pushState` cannot be
     handed as an address. */
  test('gives the home page a root rather than an empty string', () => {
    expect(pathFor('home')).toBe('/')
  })

  test('falls back rather than building an address to nowhere', () => {
    expect(pathFor('does-not-exist')).toBe(DEFAULT_ROUTE.path)
  })
})

describe('the table itself', () => {
  test('puts administration behind a privilege and the rest in front of one', () => {
    const admin = ROUTES.find((route) => route.name === 'admin')!
    expect(admin.needs).toBe(PRIVILEGE.AccessAdmin)
    expect(
      ROUTES.filter((route) => route.rail !== undefined).every(
        (route) => route.needs === undefined,
      ),
    ).toBe(true)
  })

  /* A row everybody could see would be a door most people find locked. The rail
     draws Admin itself, from the administration pages this account can open,
     rather than from a route that says it is in the rail — and home is the mark
     at the top rather than a row of its own. */
  test('keeps administration and home out of the rail', () => {
    expect(RAIL.map((entry) => entry.name)).toEqual(['library', 'editor', 'midi'])
  })

  /* The rail is as wide as its widest label, so every row in it has a word of
     its own to wear rather than falling back to a two-word title. */
  test('gives every page in the rail a label of its own', () => {
    expect(RAIL.every((entry) => (entry.rail ?? '').split(' ').length === 1)).toBe(true)
  })

  /* Somebody's own screen rather than something an administrator sets, so no
     privilege stands in front of it, and no row carries it: it is opened from
     the account menu. A privilege added here would lock the one door with
     nothing behind it worth gating, and the menu item would go on pointing at
     a page that refuses. */
  test('leaves preferences open to everybody, and out of the rail', () => {
    const preferences = ROUTES.find((route) => route.name === 'preferences')!
    expect(preferences.needs).toBeUndefined()
    expect(preferences.rail).toBeUndefined()
    expect(resolve('/preferences').route.name).toBe('preferences')
  })

  test('names every page once', () => {
    expect(new Set(ROUTES.map((route) => route.name)).size).toBe(ROUTES.length)
    expect(new Set(ROUTES.map((route) => route.path)).size).toBe(ROUTES.length)
  })
})
