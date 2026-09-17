import { describe, expect, test } from 'bun:test'
import { PRIVILEGE } from '../src/access/privileges.ts'
import {
  DEFAULT_ROUTE,
  matchRoute,
  pathFor,
  resolve,
  ROUTES,
  TABS,
} from '../src/navigation/routes.ts'

describe('resolving an address', () => {
  test('finds the page it names', () => {
    expect(resolve('/library').route.name).toBe('library')
    expect(resolve('/admin').route.name).toBe('admin')
  })

  /* The only way to reach one is to type it, and there is nothing useful an
     error page could say that the editor does not. */
  test('falls back to the default rather than to an error page', () => {
    expect(resolve('/nowhere').route).toBe(DEFAULT_ROUTE)
    expect(resolve('').route).toBe(DEFAULT_ROUTE)
    expect(resolve('/library/extra').route).toBe(DEFAULT_ROUTE)
  })

})

/* No page takes a parameter yet. The matcher does, which is what makes adding
   one a row in the table rather than a rewrite — so it is exercised directly
   against a route that is not in the live table. */
describe('matching a page that takes a parameter', () => {
  const patch = { name: 'patch', path: '/patch/:id', title: 'Patch' }

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
})

describe('building an address', () => {
  test('gives the path a page is reached at', () => {
    expect(pathFor('admin')).toBe('/admin')
    expect(pathFor('midi')).toBe('/midi')
  })

  test('falls back rather than building an address to nowhere', () => {
    expect(pathFor('does-not-exist')).toBe(DEFAULT_ROUTE.path)
  })
})

describe('the table itself', () => {
  test('puts administration behind a privilege and the rest in front of one', () => {
    const admin = ROUTES.find((route) => route.name === 'admin')!
    expect(admin.needs).toBe(PRIVILEGE.AccessAdmin)
    expect(ROUTES.filter((route) => route.tab).every((route) => route.needs === undefined)).toBe(
      true,
    )
  })

  /* A tab everybody could see would be a door most people find locked. */
  test('keeps administration out of the tab bar', () => {
    expect(TABS.map((tab) => tab.name)).toEqual(['editor', 'library', 'midi'])
  })

  test('names every page once', () => {
    expect(new Set(ROUTES.map((route) => route.name)).size).toBe(ROUTES.length)
    expect(new Set(ROUTES.map((route) => route.path)).size).toBe(ROUTES.length)
  })
})
