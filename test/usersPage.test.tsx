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

const box = (privilege: string) => screen.getByRole('checkbox', { name: privilege })

/* Faded means "a role is answering, and nothing is stored here". The row says
   which it is in an attribute and the stylesheet fades from that, so this reads
   the state rather than asking what colour anything ended up. */
const faded = (privilege: string): boolean =>
  box(privilege).closest('li')!.getAttribute('data-stored') === 'no'

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

  /* The box says whether they have it; nothing else has to be read to know. */
  test('ticks what the account holds and leaves the rest clear', () => {
    show()
    open('Ada')

    /* Everybody is a member, so this one is held — by a role. */
    expect((box(PRIVILEGE.StoreMidi) as HTMLInputElement).checked).toBe(true)
    expect((box(PRIVILEGE.AdminTags) as HTMLInputElement).checked).toBe(false)
  })

  /* Faded is the whole signal for "no row exists, a role is answering", so the
     two have to be told apart without reading the line underneath. */
  test('fades a tick that only a role is giving, and not one of its own', () => {
    show([
      user({
        uid: 'ada',
        name: 'Ada',
        granted: [PRIVILEGE.AccessAdmin],
        privileges: [PRIVILEGE.StoreMidi, PRIVILEGE.AccessAdmin],
      }),
    ])
    open('Ada')

    expect(faded(PRIVILEGE.StoreMidi)).toBe(true)
    expect(faded(PRIVILEGE.AccessAdmin)).toBe(false)
  })

  test('reads an explicit answer off the account rather than the role', () => {
    show([user({ uid: 'ada', name: 'Ada', revoked: [PRIVILEGE.StoreMidi], privileges: [] })])
    open('Ada')

    expect((box(PRIVILEGE.StoreMidi) as HTMLInputElement).checked).toBe(false)
    expect(faded(PRIVILEGE.StoreMidi)).toBe(false)
    expect(screen.getAllByText(/revoked for this account/)[0]).toBeTruthy()
  })

  test('hands back a grant when a clear box is ticked', () => {
    const { decided } = show()
    open('Ada')
    fireEvent.click(box(PRIVILEGE.AdminTags))

    expect(decided).toEqual([
      { uid: 'ada', privilege: PRIVILEGE.AdminTags, decision: 'granted' },
    ])
  })

  test('hands back a revoke when a ticked box is cleared', () => {
    const { decided } = show()
    open('Ada')
    fireEvent.click(box(PRIVILEGE.StoreMidi))

    expect(decided).toEqual([
      { uid: 'ada', privilege: PRIVILEGE.StoreMidi, decision: 'revoked' },
    ])
  })

  /* Going back to the roles' answer is deleting the row, and is offered only
     where there is one — otherwise every row would carry a button that does
     nothing. */
  test('offers a way back to the default only where something is stored', () => {
    show([user({ uid: 'ada', name: 'Ada', revoked: [PRIVILEGE.StoreMidi], privileges: [] })])
    open('Ada')

    expect(
      screen.getByRole('button', { name: `Use the default for ${PRIVILEGE.StoreMidi}` }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: `Use the default for ${PRIVILEGE.AdminTags}` }),
    ).toBeNull()
  })

  test('hands back an inherit when the default is asked for', () => {
    const { decided } = show([
      user({ uid: 'ada', name: 'Ada', revoked: [PRIVILEGE.StoreMidi], privileges: [] }),
    ])
    open('Ada')
    fireEvent.click(
      screen.getByRole('button', { name: `Use the default for ${PRIVILEGE.StoreMidi}` }),
    )

    expect(decided).toEqual([
      { uid: 'ada', privilege: PRIVILEGE.StoreMidi, decision: 'inherited' },
    ])
  })

  test('hands back a role being given', () => {
    const { roled } = show()
    open('Ada')
    fireEvent.click(screen.getByRole('button', { name: 'Give the tester role' }))

    expect(roled).toEqual([{ uid: 'ada', roles: [ROLE.tester] }])
  })

  /* Being an administrator is not a decision this page makes, so it is not
     drawn as something to press. Tester is the only role anybody is given. */
  test('offers no admin toggle, and says where being one comes from', () => {
    show([user({ uid: 'root', name: 'Root', envAdmin: true })])
    open('Root')

    expect(screen.queryByRole('button', { name: 'Give the admin role' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove the admin role' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Give the tester role' })).toBeTruthy()
    expect(
      screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('MOOG_ADMINS')),
    ).toBe(true)
  })

  test('flags a grant that a role already covers, which says nothing yet', () => {
    show([
      user({
        uid: 'grace',
        name: 'Grace',
        envAdmin: true,
        granted: [PRIVILEGE.AdminTags],
        privileges: [
          PRIVILEGE.AccessAdmin,
          PRIVILEGE.AdminUsers,
          PRIVILEGE.AdminTags,
          PRIVILEGE.AdminPatches,
          PRIVILEGE.StoreMidi,
        ],
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
