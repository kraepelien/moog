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

/* Nobody by default: the two refusals about your own account are their own
   tests, and every other one would otherwise depend on who was signed in. */
function show(people: readonly AdminUser[] = PEOPLE, viewerUid: string | null = null) {
  const decided: { uid: string; privilege: Privilege; decision: Decision }[] = []
  const roled: { uid: string; roles: readonly Role[] }[] = []

  render(
    <AccessProvider privileges={[PRIVILEGE.AdminUsers]}>
      <UsersPage
        users={people}
        viewerUid={viewerUid}
        onDecide={(who, privilege, decision) =>
          decided.push({ uid: who.uid, privilege, decision })
        }
        onRoles={(who, roles) => roled.push({ uid: who.uid, roles })}
      />
    </AccessProvider>,
  )
  return { decided, roled }
}

const grant = (privilege: string) =>
  screen.getByRole('checkbox', { name: `Grant ${privilege}` }) as HTMLInputElement
const revoke = (privilege: string) =>
  screen.getByRole('checkbox', { name: `Revoke ${privilege}` }) as HTMLInputElement

/* Faded means "a role is answering, and nothing is stored here". The row says
   which it is in an attribute and the stylesheet fades from that, so this reads
   the state rather than asking what colour anything ended up. */
const faded = (privilege: string): boolean =>
  grant(privilege).closest('li')!.getAttribute('data-stored') === 'no'

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

  /* The grant box says whether they have it; nothing else has to be read to
     know, and the revoke box beside it is empty until somebody decides. */
  test('ticks what the account holds and leaves the rest clear', () => {
    show()
    open('Ada')

    /* Everybody is a member, so this one is held — by a role. */
    expect(grant(PRIVILEGE.StoreMidi).checked).toBe(true)
    expect(revoke(PRIVILEGE.StoreMidi).checked).toBe(false)
    expect(grant(PRIVILEGE.AdminTags).checked).toBe(false)
    expect(revoke(PRIVILEGE.AdminTags).checked).toBe(false)
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

  /* A revoke is a decision that outlives the role, so it is its own box rather
     than the absence of a tick in the other one. */
  test('reads an explicit answer off the account rather than the role', () => {
    show([user({ uid: 'ada', name: 'Ada', revoked: [PRIVILEGE.StoreMidi], privileges: [] })])
    open('Ada')

    expect(grant(PRIVILEGE.StoreMidi).checked).toBe(false)
    expect(revoke(PRIVILEGE.StoreMidi).checked).toBe(true)
    expect(faded(PRIVILEGE.StoreMidi)).toBe(false)
    expect(screen.getAllByText(/revoked for this account/)[0]).toBeTruthy()
  })

  test('hands back a grant when a clear box is ticked', () => {
    const { decided } = show()
    open('Ada')
    fireEvent.click(grant(PRIVILEGE.AdminTags))

    expect(decided).toEqual([
      { uid: 'ada', privilege: PRIVILEGE.AdminTags, decision: 'granted' },
    ])
  })

  test('hands back a revoke when the revoke box is ticked', () => {
    const { decided } = show()
    open('Ada')
    fireEvent.click(revoke(PRIVILEGE.StoreMidi))

    expect(decided).toEqual([
      { uid: 'ada', privilege: PRIVILEGE.StoreMidi, decision: 'revoked' },
    ])
  })

  /* The one click that crosses over: no row is holding the tick up, so there is
     nothing to delete and wanting it off can only be a revoke. */
  test('turns clearing a tick a role is giving into a revoke', () => {
    const { decided } = show()
    open('Ada')
    fireEvent.click(grant(PRIVILEGE.StoreMidi))

    expect(decided).toEqual([
      { uid: 'ada', privilege: PRIVILEGE.StoreMidi, decision: 'revoked' },
    ])
  })

  /* Clearing either box is how an override goes away, which is why no row
     carries a button for it. */
  test('goes back to the default when a stored grant is cleared', () => {
    const { decided } = show([
      user({
        uid: 'ada',
        name: 'Ada',
        granted: [PRIVILEGE.AdminTags],
        privileges: [PRIVILEGE.StoreMidi],
      }),
    ])
    open('Ada')
    fireEvent.click(grant(PRIVILEGE.AdminTags))

    expect(decided).toEqual([
      { uid: 'ada', privilege: PRIVILEGE.AdminTags, decision: 'inherited' },
    ])
  })

  test('goes back to the default when a stored revoke is cleared', () => {
    const { decided } = show([
      user({ uid: 'ada', name: 'Ada', revoked: [PRIVILEGE.StoreMidi], privileges: [] }),
    ])
    open('Ada')
    fireEvent.click(revoke(PRIVILEGE.StoreMidi))

    expect(decided).toEqual([
      { uid: 'ada', privilege: PRIVILEGE.StoreMidi, decision: 'inherited' },
    ])
  })

  test('offers no separate button for the default', () => {
    show([user({ uid: 'ada', name: 'Ada', revoked: [PRIVILEGE.StoreMidi], privileges: [] })])
    open('Ada')

    expect(
      screen.queryByRole('button', { name: `Use the default for ${PRIVILEGE.StoreMidi}` }),
    ).toBeNull()
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

/* Two of the three write-time refusals are knowable from the account on screen,
   so the page draws them rather than offering a box whose only outcome is the
   error banner it used to be. */
describe('what cannot be revoked', () => {
  const ADMIN_PRIVILEGES = [
    PRIVILEGE.AccessAdmin,
    PRIVILEGE.AdminUsers,
    PRIVILEGE.AdminTags,
    PRIVILEGE.AdminLayout,
    PRIVILEGE.AdminPatches,
    PRIVILEGE.StoreMidi,
  ]

  const ROOT = user({
    uid: 'root',
    name: 'Root',
    envAdmin: true,
    privileges: ADMIN_PRIVILEGES,
  })

  test('locks the two that recover a locked-out install, ticked rather than clear', () => {
    show([ROOT])
    open('Root')

    for (const privilege of [PRIVILEGE.AccessAdmin, PRIVILEGE.AdminUsers]) {
      expect(grant(privilege).checked).toBe(true)
      expect(grant(privilege).disabled).toBe(true)
      expect(revoke(privilege).disabled).toBe(true)
    }
  })

  /* Only the two. An address in the environment is an ordinary account for
     everything that cannot strand anybody. */
  test('leaves the rest of an environment admin changeable', () => {
    show([ROOT])
    open('Root')

    expect(grant(PRIVILEGE.AdminTags).disabled).toBe(false)
    expect(revoke(PRIVILEGE.AdminTags).disabled).toBe(false)
  })

  test('says why on the row rather than after the click', () => {
    show([ROOT])
    open('Root')

    expect(screen.getAllByText(/cannot be revoked/).length).toBeGreaterThan(0)
  })

  /* The other refusal: the page you would need to undo it is the one you are
     standing on. Nothing about the account says this, only who is looking. */
  test('locks the same two on your own account', () => {
    show([user({ uid: 'ada', name: 'Ada', privileges: ADMIN_PRIVILEGES })], 'ada')
    open('Ada')

    expect(revoke(PRIVILEGE.AccessAdmin).disabled).toBe(true)
    expect(revoke(PRIVILEGE.AdminUsers).disabled).toBe(true)
  })

  test('leaves them open on somebody else the environment does not list', () => {
    show([user({ uid: 'ada', name: 'Ada', privileges: ADMIN_PRIVILEGES })], 'grace')
    open('Ada')

    expect(revoke(PRIVILEGE.AccessAdmin).disabled).toBe(false)
    expect(revoke(PRIVILEGE.AdminUsers).disabled).toBe(false)
  })
})
