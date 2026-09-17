import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { Can, RouteGuard } from '@access/Can.tsx'
import { AccessProvider } from '@access/AccessProvider.tsx'
import { PRIVILEGE } from '@access/privileges.ts'

afterEach(cleanup)

const holding = (privileges: readonly string[], children: React.ReactNode) =>
  render(<AccessProvider privileges={privileges}>{children}</AccessProvider>)

describe('a control behind Can', () => {
  test('is drawn for somebody holding the privilege', () => {
    holding(
      [PRIVILEGE.StoreMidi],
      <Can privilege={PRIVILEGE.StoreMidi}>
        <button>Save to channel</button>
      </Can>,
    )
    expect(screen.queryByRole('button', { name: 'Save to channel' })).toBeTruthy()
  })

  /* Absent rather than disabled: a button that is not for you reads as broken
     when it is greyed out and honest when it is simply not there. */
  test('is absent for somebody without it, rather than shown refusing', () => {
    holding(
      [PRIVILEGE.AdminTags],
      <Can privilege={PRIVILEGE.StoreMidi}>
        <button>Save to channel</button>
      </Can>,
    )
    expect(screen.queryByRole('button', { name: 'Save to channel' })).toBeNull()
  })

  test('draws what it was given instead, where something has to stand there', () => {
    holding(
      [],
      <Can privilege={PRIVILEGE.StoreMidi} otherwise={<p>Sign up to keep this</p>}>
        <button>Save to channel</button>
      </Can>,
    )
    expect(screen.getByText('Sign up to keep this')).toBeTruthy()
  })

  test('believes nothing it cannot name, so a newer server cannot widen it', () => {
    holding(
      ['AdminEverything'],
      <Can privilege={PRIVILEGE.AdminTags}>
        <button>Edit tags</button>
      </Can>,
    )
    expect(screen.queryByRole('button', { name: 'Edit tags' })).toBeNull()
  })
})

describe('a page behind RouteGuard', () => {
  test('opens for somebody holding the privilege', () => {
    holding(
      [PRIVILEGE.AccessAdmin],
      <RouteGuard privilege={PRIVILEGE.AccessAdmin} title="Administration">
        <p>The admin page</p>
      </RouteGuard>,
    )
    expect(screen.getByText('The admin page')).toBeTruthy()
  })

  /* Out loud, unlike Can: a page is reachable by typing its address, and an
     empty page whose every button is refused reads as broken rather than shut. */
  test('says no where a hidden page would look broken', () => {
    holding(
      [],
      <RouteGuard privilege={PRIVILEGE.AccessAdmin} title="Administration">
        <p>The admin page</p>
      </RouteGuard>,
    )
    expect(screen.queryByText('The admin page')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('not for this account')
  })

  test('lets a page that asks for nothing through', () => {
    holding(
      [],
      <RouteGuard privilege={undefined} title="Patch editor">
        <p>The editor</p>
      </RouteGuard>,
    )
    expect(screen.getByText('The editor')).toBeTruthy()
  })
})
