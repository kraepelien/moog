import { afterEach, describe, expect, test } from 'bun:test'
import { adoptLegacyHash, navigate } from '@navigation/router.ts'
import { resolve } from '@navigation/routes.ts'

/* The address lives in the path now. What these pin is the three things that
   changed with it: a query no longer confuses the match, a press of Back is the
   same event as a navigation, and a link bookmarked when the routes were in the
   fragment still opens the page it names. */

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

const at = () => window.location.pathname + window.location.search

describe('navigating', () => {
  test('puts the page in the address', () => {
    navigate('/library')
    expect(at()).toBe('/library')
  })

  test('leaves an entry to go back to', () => {
    navigate('/library')
    navigate('/admin/users')
    expect(at()).toBe('/admin/users')

    window.history.back()
    /* happy-dom applies this synchronously; a browser would fire popstate, which
       is the event the store also listens to. */
    expect(at()).toBe('/library')
  })

  /* Pressing a tab twice should not fill the history with the same page. */
  test('does not stack the address it is already on', () => {
    navigate('/library')
    const depth = window.history.length
    navigate('/library')
    expect(window.history.length).toBe(depth)
  })
})

describe('resolving an address with a query on it', () => {
  test('matches the path and ignores the rest', () => {
    expect(resolve('/library?q=bass').route.name).toBe('library')
    expect(resolve('/admin/users?q=peter').route.name).toBe('users')
  })

  /* A sign-in that failed comes back with `?error=`, and the page it lands on
     has to be found before anything can read it. */
  test('still resolves when the query is the only interesting part', () => {
    expect(resolve('/signed-out?error=expired').route.name).toBe('editor')
  })
})

describe('an address bookmarked when the routes were in the fragment', () => {
  test('is rewritten to the path it names', () => {
    window.history.replaceState(null, '', '/#/admin/users')
    adoptLegacyHash()
    expect(window.location.pathname).toBe('/admin/users')
  })

  test('leaves an ordinary address alone', () => {
    window.history.replaceState(null, '', '/library')
    adoptLegacyHash()
    expect(at()).toBe('/library')
  })

  /* A real fragment anchor is not a route, and rewriting it would throw away
     wherever it pointed. */
  test('leaves a fragment that is not a path alone', () => {
    window.history.replaceState(null, '', '/library#notes')
    adoptLegacyHash()
    expect(window.location.pathname).toBe('/library')
  })
})
