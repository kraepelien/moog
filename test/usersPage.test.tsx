import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AccessProvider } from '@access/AccessProvider.tsx'
import { PRIVILEGE, ROLE, type Privilege, type Role } from '@access/privileges.ts'
import { UsersPage } from '@admin/UsersPage.tsx'
import type { Decision } from '@admin/UserAccess.tsx'
import type { AdminUser } from '@admin/users.ts'

afterEach(cleanup)

function user(overrides: Partial<AdminUser> & { uid: string }): AdminUser {
  return {
    name: overrides.uid,
    email: `${overrides.uid}@example.com`,
    avatar: null,
    provider: 'test',
    roles: [],
    envAdmin: false,
    privileges: [PRIVILEGE.StoreMidi],
    granted: [],
    revoked: [],
    unknown: [],
    stats: { patches: 0, arrangements: 0, ratings: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-02-03T00:00:00.000Z',
    ...overrides,
  }
}

const PEOPLE: readonly AdminUser[] = [
  user({ uid: 'ada', name: 'Ada', stats: { patches: 3, arrangements: 1, ratings: 7 } }),
  user({ uid: 'grace', name: 'Grace', roles: [ROLE.admin] }),
]

function show(people: readonly AdminUser[] = PEOPLE) {
  const decided: { uid: string; privilege: Privilege; decision: Decision }[] = []
  const roled: { uid: string; roles: readonly Role[] }[] = []

  render(
    <AccessProvider privileges={[PRIVILEGE.AdminUsers]}>
      <UsersPage
        users={people}
        onDecide={(who, privilege, decision) =>
          decided.push({ uid: who.uid, privilege, decision })
        }
        onRoles={(who, roles) => roled.push({ uid: who.uid, roles })}
      />
    </AccessProvider>,
  )
  return { decided, roled }
}

const search = () => screen.getByLabelText('Search people') as HTMLInputElement
const type = (text: string) => fireEvent.change(search(), { target: { value: text } })
const open = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: `Change what ${name} may do` }))

describe('the list', () => {
  test('shows everybody with what they have made', () => {
    show()
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.getByText('Grace')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
  })

  test('narrows to what was typed, across name and address', () => {
    show()
    type('grace')
    expect(screen.queryByText('Ada')).toBeNull()
    expect(screen.getByText('Grace')).toBeTruthy()

    type('ada@example')
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.queryByText('Grace')).toBeNull()
  })

  test('says so when nothing matches, differently from nobody at all', () => {
    show()
    type('nobody')
    expect(screen.getByText(/Nobody by that name/)).toBeTruthy()

    cleanup()
    show([])
    expect(screen.getByText(/Nobody has signed in yet/)).toBeTruthy()
  })

  /* The counts of overrides, so a row that has been meddled with is visible
     without opening it. */
  test('marks an account with privileges added or taken away', () => {
    show([user({ uid: 'ada', name: 'Ada', granted: [PRIVILEGE.AdminTags] })])
    expect(screen.getByText('+1')).toBeTruthy()
  })

  test('marks somebody the environment makes an admin', () => {
    show([user({ uid: 'root', name: 'Root', envAdmin: true })])
    expect(screen.getByText('admin (.env)')).toBeTruthy()
  })
})

describe('the editor', () => {
  test('opens on the person picked and comes back to the list', () => {
    show()
    open('Ada')
    expect(screen.getByRole('heading', { name: 'Ada' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '← Everybody' }))
    expect(screen.getByText('Grace')).toBeTruthy()
  })

  test('says what each privilege lets somebody do', () => {
    show()
    open('Ada')
    expect(screen.getByText(/Save a MIDI file together with the sound/)).toBeTruthy()
  })

  /* Three states, because "nobody has said" is not the same as "no". */
  test('shows which of the three each privilege is on', () => {
    show()
    open('Ada')

    const pressed = (label: string) =>
      screen.getByRole('button', { name: label }).getAttribute('aria-pressed')

    /* Everybody is a member, so this one comes from a role. */
    expect(pressed('Default StoreMidi')).toBe('true')
    expect(pressed('Granted StoreMidi')).toBe('false')
    expect(pressed('Default AdminTags')).toBe('true')
  })

  test('reads an explicit answer off the account rather than the preset', () => {
    show([user({ uid: 'ada', name: 'Ada', revoked: [PRIVILEGE.StoreMidi], privileges: [] })])
    open('Ada')

    expect(
      screen.getByRole('button', { name: 'Revoked StoreMidi' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getAllByText(/revoked for this account/)[0]).toBeTruthy()
  })

  test('hands back which way a privilege was moved', () => {
    const { decided } = show()
    open('Ada')
    fireEvent.click(screen.getByRole('button', { name: 'Revoked AdminTags' }))

    expect(decided).toEqual([
      { uid: 'ada', privilege: PRIVILEGE.AdminTags, decision: 'revoked' },
    ])
  })

  test('hands back a role being given', () => {
    const { roled } = show()
    open('Ada')
    fireEvent.click(screen.getByRole('button', { name: 'Give the tester role' }))

    expect(roled).toEqual([{ uid: 'ada', roles: [ROLE.tester] }])
  })

  /* The server refuses it, so offering it would be a button that fails. */
  test('will not offer to take the admin role off an environment admin', () => {
    show([user({ uid: 'root', name: 'Root', envAdmin: true })])
    open('Root')

    const toggle = screen.getByRole('button', { name: 'Give the admin role' })
    expect((toggle as HTMLButtonElement).disabled).toBe(true)
    expect(
      screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('MOOG_ADMINS')),
    ).toBe(true)
  })

  test('flags a grant that a role already covers, which says nothing yet', () => {
    show([
      user({
        uid: 'grace',
        name: 'Grace',
        roles: [ROLE.admin],
        granted: [PRIVILEGE.AdminTags],
      }),
    ])
    open('Grace')
    expect(screen.getByText(/a role already gives it/)).toBeTruthy()
  })

  /* A row reading "granted" while the account cannot do it is the confusing
     case, so the boundary is said out loud rather than left to be worked out. */
  test('says when a grant does nothing because AccessAdmin is not held', () => {
    show([
      user({
        uid: 'ada',
        name: 'Ada',
        granted: [PRIVILEGE.AdminTags],
        privileges: [PRIVILEGE.StoreMidi],
      }),
    ])
    open('Ada')
    expect(screen.getByText(/does nothing without AccessAdmin/)).toBeTruthy()
  })

  /* Kept and shown rather than hidden: it is somebody's decision, and a build
     that hid it would look like it had lost it. */
  test('reports an override naming something this build does not know', () => {
    show([user({ uid: 'ada', name: 'Ada', unknown: ['AdminEverything'] })])
    open('Ada')
    expect(screen.getByText(/AdminEverything/)).toBeTruthy()
  })
})
