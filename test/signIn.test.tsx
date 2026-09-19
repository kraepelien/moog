import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { SignIn } from '@session/SignIn.tsx'
import { returnToFor } from '@session/session.ts'

afterEach(cleanup)

/* The server redirects a failed sign-in to `/signed-out?error=...`. While the
   routes lived in the fragment that query arrived there too, where nothing could
   read it, so the attempt failed silently and landed on the editor. */
describe('the sign-in page', () => {
  test('offers the way in', () => {
    render(<SignIn />)
    const button = screen.getByRole('link', { name: 'Sign in with Google' })
    expect(button.getAttribute('href')).toContain('/api/auth/google/start')
  })

  test('comes back to the page that sent you', () => {
    render(<SignIn returnTo="/admin/users" />)
    expect(screen.getByRole('link', { name: 'Sign in with Google' }).getAttribute('href')).toContain(
      encodeURIComponent('/admin/users'),
    )
  })

  test('says why the last attempt did not finish', () => {
    render(<SignIn error="expired" />)
    expect(screen.getByRole('alert').textContent).toContain('took too long')
  })

  test('says nothing when nothing went wrong', () => {
    render(<SignIn />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  /* A reason this build does not recognise is not worth inventing wording for,
     and is better than showing the raw word from a query string. */
  test('stays quiet about a reason it does not know', () => {
    render(<SignIn error="something-else" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

/* The bug this closes: the page used to be handed the route's *declared* path,
   which is literally `/patch/:id` for the one route that takes a parameter. It
   worked for as long as every path was a literal, and the server accepts it,
   so nothing else would have caught it. */
describe('where signing in comes back to', () => {
  test('keeps the address that was asked for, parameter and all', () => {
    expect(returnToFor('/patch/sub-bass')).toBe('/patch/sub-bass')
    expect(returnToFor('/patch/sub-bass')).not.toBe('/patch/:id')
  })

  test('drops the query, which belongs to the page that read it', () => {
    expect(returnToFor('/patch/sub-bass?error=expired')).toBe('/patch/sub-bass')
  })

  test('never answers an empty address, which pushState cannot be given', () => {
    expect(returnToFor('')).toBe('/')
    expect(returnToFor('?error=expired')).toBe('/')
  })
})
