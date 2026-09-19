import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AccessProvider } from '@access/AccessProvider.tsx'
import {
  PRIVILEGE,
  PRIVILEGES,
  ROLE,
  TITLE,
  type Privilege,
  type Role,
} from '@access/privileges.ts'
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
    /* A tester, because StoreMidi sits on that rung: an account holding it
       with no role would be a state the resolver never produces. */
    roles: [ROLE.tester],
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

/* One position of one privilege's control. The aria labels carry the stored
   name rather than the title, so a row is found by the thing that cannot
   change without the lock file saying so. */
const pick = (position: string, privilege: string) =>
  screen.getByRole('button', { name: `${position} ${privilege}` }) as HTMLButtonElement

const row = (privilege: string): HTMLElement => pick('Grant', privilege).closest('li')!

/* Which of the three it is sitting on, read off the pressed state MUI gives
   the group rather than off anything this file decides. */
const at = (privilege: string): Decision => {
  const on: [string, Decision][] = [
    ['Grant', 'granted'],
    ['Use the roles for', 'inherited'],
    ['Revoke', 'revoked'],
  ]
  const found = on.find(
    ([position]) => pick(position, privilege).getAttribute('aria-pressed') === 'true',
  )
  if (!found) throw new Error(`No position pressed for ${privilege}`)
  return found[1]
}

/* Whether a row of its own is holding the answer up, as against a role
   answering. The row says which in an attribute and the stylesheet reads that,
   so this reads the state rather than asking what colour anything ended up. */
const stored = (privilege: string): boolean =>
  row(privilege).getAttribute('data-stored') === 'yes'

const card = (role: Role): HTMLElement =>
  screen.getByText(role, { selector: 'span' }).closest('[data-held]')!

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

  /* The row reads as something a person can do; the stored name is beside it
     because that is what an override row and an error name. */
  test('names each privilege in words and keeps the stored name', () => {
    show()
    open('Ada')

    const line = row(PRIVILEGE.StoreMidi).textContent
    expect(line).toContain(TITLE[PRIVILEGE.StoreMidi])
    expect(line).toContain(PRIVILEGE.StoreMidi)
  })

  /* The whole reason the long descriptions came off the rows: six paragraphs
     is a list nobody reads, so it has to be reachable in one hover. */
  test('says what a privilege lets somebody do, behind the info icon', async () => {
    show()
    open('Ada')

    fireEvent.mouseOver(screen.getByRole('button', { name: `About ${PRIVILEGE.StoreMidi}` }))
    expect(await screen.findByText(/Save a MIDI file together with the sound/)).toBeTruthy()
  })

  test('offers one for every privilege there is', () => {
    show()
    open('Ada')

    for (const privilege of PRIVILEGES) {
      expect(screen.getByRole('button', { name: `About ${privilege}` })).toBeTruthy()
    }
  })

  /* One control, three positions, and the position it is in is the whole
     answer — nothing else has to be read to know what is stored. */
  test('sits on the roles where nothing is stored against the account', () => {
    show()
    open('Ada')

    expect(at(PRIVILEGE.StoreMidi)).toBe('inherited')
    expect(at(PRIVILEGE.AdminTags)).toBe('inherited')
    expect(stored(PRIVILEGE.StoreMidi)).toBe(false)
  })

  test('sits on the answer stored against the account', () => {
    show([
      user({
        uid: 'ada',
        name: 'Ada',
        granted: [PRIVILEGE.AccessAdmin],
        revoked: [PRIVILEGE.StoreMidi],
        privileges: [PRIVILEGE.AccessAdmin],
      }),
    ])
    open('Ada')

    expect(at(PRIVILEGE.AccessAdmin)).toBe('granted')
    expect(at(PRIVILEGE.StoreMidi)).toBe('revoked')
    expect(stored(PRIVILEGE.AccessAdmin)).toBe(true)
    expect(stored(PRIVILEGE.StoreMidi)).toBe(true)
  })

  /* Whether they can actually do it is not the same question as what is
     stored, so it is said rather than inferred from the control. */
  test('says whether the account ends up holding it', () => {
    show()
    open('Ada')

    expect(row(PRIVILEGE.StoreMidi).textContent).toContain('Allowed')
    expect(row(PRIVILEGE.AdminTags).textContent).toContain('Not allowed')
  })

  /* "From a role" left somebody to work out which one, and which one is what
     they would have to take away. */
  test('names the role that is answering', () => {
    show()
    open('Ada')
    expect(row(PRIVILEGE.StoreMidi).textContent).toContain('the tester role gives it')
  })

  test('says so where no role gives it at all', () => {
    show()
    open('Ada')
    expect(row(PRIVILEGE.AdminTags).textContent).toContain('no role gives it')
  })

  test('hands back a grant', () => {
    const { decided } = show()
    open('Ada')
    fireEvent.click(pick('Grant', PRIVILEGE.AdminTags))

    expect(decided).toEqual([{ uid: 'ada', privilege: PRIVILEGE.AdminTags, decision: 'granted' }])
  })

  test('hands back a revoke', () => {
    const { decided } = show()
    open('Ada')
    fireEvent.click(pick('Revoke', PRIVILEGE.StoreMidi))

    expect(decided).toEqual([{ uid: 'ada', privilege: PRIVILEGE.StoreMidi, decision: 'revoked' }])
  })

  /* Going back to the roles is a position rather than a button, because it is
     the same thing as deleting the row. */
  test('hands back the roles answer, which is deleting the row', () => {
    const { decided } = show([
      user({
        uid: 'ada',
        name: 'Ada',
        roles: [ROLE.tester],
        revoked: [PRIVILEGE.StoreMidi],
        privileges: [],
      }),
    ])
    open('Ada')
    fireEvent.click(pick('Use the roles for', PRIVILEGE.StoreMidi))

    expect(decided).toEqual([{ uid: 'ada', privilege: PRIVILEGE.StoreMidi, decision: 'inherited' }])
  })

  /* Pressing the position it is already in is MUI reporting null, and writing
     the answer already stored would be a request for nothing. */
  test('says nothing when the position it is already in is pressed', () => {
    const { decided } = show()
    open('Ada')
    fireEvent.click(pick('Use the roles for', PRIVILEGE.AdminTags))

    expect(decided).toEqual([])
  })

  test('offers no separate button for the default', () => {
    show([user({ uid: 'ada', name: 'Ada', revoked: [PRIVILEGE.StoreMidi], privileges: [] })])
    open('Ada')

    expect(
      screen.queryByRole('button', { name: `Use the default for ${PRIVILEGE.StoreMidi}` }),
    ).toBeNull()
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
    expect(row(PRIVILEGE.AdminTags).textContent).toContain('already gives it')
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
    expect(row(PRIVILEGE.AdminTags).textContent).toContain(
      `does nothing without ${TITLE[PRIVILEGE.AccessAdmin]}`,
    )
  })

  /* Kept and shown rather than hidden: it is somebody's decision, and a build
     that hid it would look like it had lost it. */
  test('reports an override naming something this build does not know', () => {
    show([user({ uid: 'ada', name: 'Ada', unknown: ['AdminEverything'] })])
    open('Ada')
    expect(screen.getByText(/AdminEverything/)).toBeTruthy()
  })
})

/* "tester" on its own says nothing about what it hands over, which is the
   question somebody is actually answering when they press Give. */
describe('what a role gives', () => {
  test('lists what each rung adds, beside the button that gives it', () => {
    show()
    open('Ada')

    expect(card(ROLE.tester).textContent).toContain(TITLE[PRIVILEGE.StoreMidi])

    const admin = card(ROLE.admin)
    expect(admin.textContent).toContain(TITLE[PRIVILEGE.AdminUsers])
    /* What a lower rung already carries is not re-listed: the card says what
       this rung adds, and the ladder says the rest. */
    expect(admin.textContent).not.toContain(TITLE[PRIVILEGE.StoreMidi])
  })

  test('says a rung adds nothing rather than drawing an empty card', () => {
    show()
    open('Ada')
    expect(card(ROLE.member).textContent).toContain('Adds nothing')
  })

  /* The card doubles as a preview of pressing Give, so what the account
     already holds is marked apart from what the role would add. */
  test('marks what the account already holds', () => {
    show([
      user({ uid: 'ada', name: 'Ada', roles: [ROLE.tester], privileges: [PRIVILEGE.StoreMidi] }),
    ])
    open('Ada')

    const holds = card(ROLE.tester).querySelectorAll('[data-has="yes"]')
    expect(holds.length).toBe(1)
    expect(holds[0]!.textContent).toBe(TITLE[PRIVILEGE.StoreMidi])
  })

  test('hands back a role being given', () => {
    const { roled } = show([user({ uid: 'ada', name: 'Ada', roles: [], privileges: [] })])
    open('Ada')
    fireEvent.click(screen.getByRole('button', { name: 'Give the tester role' }))

    expect(roled).toEqual([{ uid: 'ada', roles: [ROLE.tester] }])
  })

  test('hands back a role being taken away', () => {
    const { roled } = show()
    open('Ada')
    fireEvent.click(screen.getByRole('button', { name: 'Remove the tester role' }))

    expect(roled).toEqual([{ uid: 'ada', roles: [] }])
  })

  /* Being an administrator is not a decision this page makes, so it is not
     drawn as something to press. Tester is the only role anybody is given. */
  test('offers no admin toggle, and says where being one comes from', () => {
    show([user({ uid: 'root', name: 'Root', envAdmin: true })])
    open('Root')

    expect(screen.queryByRole('button', { name: 'Give the admin role' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove the admin role' })).toBeNull()
    expect(card(ROLE.admin).textContent).toContain('MOOG_ADMINS')
    expect(
      screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('MOOG_ADMINS')),
    ).toBe(true)
  })
})

/* Two of the three write-time refusals are knowable from the account on screen,
   so the page draws them rather than offering a position whose only outcome is
   the error banner it used to be. */
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

  test('locks the two that recover a locked-out install', () => {
    show([ROOT])
    open('Root')

    for (const privilege of [PRIVILEGE.AccessAdmin, PRIVILEGE.AdminUsers]) {
      expect(pick('Revoke', privilege).disabled).toBe(true)
      expect(row(privilege).textContent).toContain('Allowed')
    }
  })

  /* Only the revoke. Granting is never what the server refuses, and locking the
     other two positions left a row nobody could put back where it was. */
  test('leaves the other two positions alone', () => {
    show([ROOT])
    open('Root')

    expect(pick('Grant', PRIVILEGE.AccessAdmin).disabled).toBe(false)
    expect(pick('Use the roles for', PRIVILEGE.AccessAdmin).disabled).toBe(false)
  })

  /* Only the two. An address in the environment is an ordinary account for
     everything that cannot strand anybody. */
  test('leaves the rest of an environment admin changeable', () => {
    show([ROOT])
    open('Root')

    expect(pick('Grant', PRIVILEGE.AdminTags).disabled).toBe(false)
    expect(pick('Revoke', PRIVILEGE.AdminTags).disabled).toBe(false)
  })

  test('says why on the row rather than after the click', () => {
    show([ROOT])
    open('Root')

    expect(row(PRIVILEGE.AccessAdmin).textContent).toContain('cannot be revoked')
  })

  /* The other refusal: the page you would need to undo it is the one you are
     standing on. Nothing about the account says this, only who is looking. */
  test('locks the same two on your own account', () => {
    show([user({ uid: 'ada', name: 'Ada', privileges: ADMIN_PRIVILEGES })], 'ada')
    open('Ada')

    expect(pick('Revoke', PRIVILEGE.AccessAdmin).disabled).toBe(true)
    expect(pick('Revoke', PRIVILEGE.AdminUsers).disabled).toBe(true)
  })

  test('leaves them open on somebody else the environment does not list', () => {
    show([user({ uid: 'ada', name: 'Ada', privileges: ADMIN_PRIVILEGES })], 'grace')
    open('Ada')

    expect(pick('Revoke', PRIVILEGE.AccessAdmin).disabled).toBe(false)
    expect(pick('Revoke', PRIVILEGE.AdminUsers).disabled).toBe(false)
  })
})
