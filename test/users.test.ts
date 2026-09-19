import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PRIVILEGE, ROLE } from '@access/privileges.ts'
import type { AdminUser } from '@admin/users.ts'
import { createPatch } from '@patch/schema.ts'
import { createApi } from '@server/api.ts'
import { openDatabase } from '@server/db.ts'
import { syncInstruments } from '@server/factory.ts'
import { authConfigFromEnv, sessionCookie } from '@server/identity.ts'
import { createRepositories } from '@server/repositories/index.ts'

/* Who may change whose access. The rules that matter here are the ones that
   keep an install reachable: nobody may strand themselves, nobody may close the
   environment's way back in, and no write may leave nobody able to administer
   users at all. */

const roots: string[] = []
const SECRET = 'users-secret'

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/* Administrators are named by uid and become `PM_ADMINS` entries, because
   that is now the only thing that makes one: the role is not stored and cannot
   be given here. `u-boss` is one in every case, since somebody has to be able
   to reach the page at all. */
async function world(admins: readonly string[] = ['u-boss']) {
  const root = mkdtempSync(join(tmpdir(), 'moog-users-'))
  roots.push(root)
  const db = openDatabase(join(root, 'moog.db'))
  syncInstruments(db)

  const config = {
    ...authConfigFromEnv({ PM_SESSION_SECRET: SECRET }),
    mode: 'oauth' as const,
    secret: SECRET,
    admins: admins.map((uid) => `${uid}@example.com`),
  }
  const handle = createApi({ db, config })
  const repositories = createRepositories(db)

  const person = async (uid: string, roles: readonly string[] = []) => {
    repositories.users.ensure({
      uid,
      provider: 'test',
      subject: uid,
      email: `${uid}@example.com`,
      displayName: uid,
      roles: roles as never,
    })
    const cookie = (
      await sessionCookie(uid, config, new Request('https://x/'), Date.now())
    ).split(';')[0]!

    return (method: string, path: string, payload?: unknown) =>
      handle(
        new Request(`http://test${path}`, {
          method,
          headers: { cookie },
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        }),
      )
  }

  return { db, repositories, handle, person }
}

const body = async <T,>(response: Response | null): Promise<T> => (await response!.json()) as T
const found = (list: AdminUser[], uid: string) => list.find((one) => one.uid === uid)!

describe('reaching the page at all', () => {
  test('needs AdminUsers, which an ordinary member does not have', async () => {
    const { person } = await world()
    const punter = await person('u-punter')

    expect((await punter('GET', '/api/users'))!.status).toBe(403)
  })

  test('is open to an admin', async () => {
    const { person } = await world()
    const boss = await person('u-boss')

    expect((await boss('GET', '/api/users'))!.status).toBe(200)
  })

  test('refuses a stranger with 401, having nobody to refuse', async () => {
    const { handle } = await world()
    expect((await handle(new Request('http://test/api/users')))!.status).toBe(401)
  })
})

describe('the list', () => {
  test('says what each account holds and where it came from', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    await person('u-punter')

    const list = await body<AdminUser[]>(await boss('GET', '/api/users'))
    const punter = found(list, 'u-punter')

    expect(punter.roles).toEqual([])
    expect(punter.privileges).toEqual([])

    /* An admin stores no role either: the column holds what somebody was given,
       and being an administrator is not given here. */
    const boss_ = found(list, 'u-boss')
    expect(boss_.roles).toEqual([])
    expect(boss_.envAdmin).toBe(true)
    expect(boss_.privileges).toContain(PRIVILEGE.AdminUsers)
  })

  test('counts what each account has made', async () => {
    const { person, repositories } = await world()
    const boss = await person('u-boss')
    await person('u-maker')

    const maker = repositories.users.find('u-maker')!
    const patch = createPatch({ name: 'Theirs' })
    repositories.patches.create(patch, maker.id, patch.id)

    const list = await body<AdminUser[]>(await boss('GET', '/api/users'))
    expect(found(list, 'u-maker').stats.patches).toBe(1)
    expect(found(list, 'u-boss').stats.patches).toBe(0)
  })

  test('marks somebody the environment lists, whose admin role is not stored', async () => {
    const { person } = await world(['u-boss', 'u-env'])
    const env = await person('u-env')

    const list = await body<AdminUser[]>(await env('GET', '/api/users'))
    const row = found(list, 'u-env')

    expect(row.envAdmin).toBe(true)
    expect(row.roles).toEqual([])
    expect(row.privileges).toContain(PRIVILEGE.AccessAdmin)
  })
})

describe('changing one privilege', () => {
  test('grants it to one account without touching the rest', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    await person('u-punter')

    /* AccessAdmin first: the administration privileges are conditional on it,
       so handing one over without it grants nothing. */
    await boss('PUT', '/api/users/u-punter/privileges/AccessAdmin', { granted: true })
    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-punter/privileges/AdminTags', { granted: true }),
    )
    expect(after.privileges).toContain(PRIVILEGE.AdminTags)
    expect(after.granted).toEqual([PRIVILEGE.AccessAdmin, PRIVILEGE.AdminTags])
  })

  test('revokes one from an admin and leaves the others', async () => {
    const { person } = await world(['u-boss', 'u-other'])
    const boss = await person('u-boss')
    await person('u-other')

    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-other/privileges/AdminTags', { granted: false }),
    )
    expect(after.privileges).not.toContain(PRIVILEGE.AdminTags)
    expect(after.privileges).toContain(PRIVILEGE.AccessAdmin)
    expect(after.revoked).toEqual([PRIVILEGE.AdminTags])
  })

  /* Inherited is the absence of a row, not a third stored state. */
  test('puts it back to inherited by deleting the row', async () => {
    const { person } = await world(['u-boss', 'u-other'])
    const boss = await person('u-boss')
    await person('u-other')

    await boss('PUT', '/api/users/u-other/privileges/AdminTags', { granted: false })
    const after = await body<AdminUser>(
      await boss('DELETE', '/api/users/u-other/privileges/AdminTags'),
    )

    expect(after.revoked).toEqual([])
    expect(after.privileges).toContain(PRIVILEGE.AdminTags)
  })

  test('refuses a privilege it has never heard of', async () => {
    const { person } = await world()
    const boss = await person('u-boss')

    expect(
      (await boss('PUT', '/api/users/u-boss/privileges/AdminEverything', { granted: true }))!
        .status,
    ).toBe(404)
  })

  test('needs a body that says which way', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    await person('u-punter')

    expect(
      (await boss('PUT', '/api/users/u-punter/privileges/AdminTags', { granted: 'yes' }))!.status,
    ).toBe(400)
  })
})

/* The columns every write has always filled, read back for the first time.
   They are the one audit trail the app has. */
describe('the stamp on an override', () => {
  const stamp = (user: AdminUser, privilege: string) =>
    user.decisions.find((one) => one.privilege === privilege)

  test('names the administrator who wrote it, and when', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    await person('u-punter')

    const before = Date.now()
    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-punter/privileges/AdminTags', { granted: true }),
    )

    const written = stamp(after, PRIVILEGE.AdminTags)!
    expect(written.granted).toBe(true)
    expect(written.by).toMatchObject({ uid: 'u-boss', name: 'u-boss' })
    expect(Date.parse(written.at)).toBeGreaterThanOrEqual(before)
  })

  /* `by_user_id` is `on delete set null`, and the install writes rows with no
     actor of its own. Neither can be told from the other, and neither may be
     given a name. */
  test('comes back null where no actor was written', async () => {
    const { person, repositories } = await world()
    const boss = await person('u-boss')
    await person('u-punter')

    const row = repositories.users.find('u-punter')!
    repositories.users.setOverride(row.id, PRIVILEGE.AdminTags, true, null)

    const list = await body<AdminUser[]>(await boss('GET', '/api/users'))
    expect(stamp(found(list, 'u-punter'), PRIVILEGE.AdminTags)!.by).toBeNull()
  })

  test('goes with the row when the override is cleared', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    await person('u-punter')

    await boss('PUT', '/api/users/u-punter/privileges/AdminTags', { granted: true })
    const after = await body<AdminUser>(
      await boss('DELETE', '/api/users/u-punter/privileges/AdminTags'),
    )

    expect(after.decisions).toEqual([])
  })

  /* One privilege is written at a time, so a name this build has never heard
     of keeps its own stamp through a write to something else. */
  test('survives, for an unknown name, a write to a different privilege', async () => {
    const { person, repositories } = await world()
    const boss = await person('u-boss')
    await person('u-punter')

    const row = repositories.users.find('u-punter')!
    repositories.users.setOverride(row.id, 'AdminEverything', false, row.id)

    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-punter/privileges/AdminTags', { granted: true }),
    )

    const kept = stamp(after, 'AdminEverything')!
    expect(kept.granted).toBe(false)
    expect(kept.by).toMatchObject({ uid: 'u-punter' })
  })

  /* The regression this shape was chosen to avoid: the stamps ride beside the
     two lists rather than inside them, so what a viewer ends up holding is
     still `resolve(roles, overridesOf(id))` and nothing else. */
  test('changes nothing about what anybody is resolved to hold', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    const other = await person('u-other', [ROLE.tester])

    await boss('PUT', '/api/users/u-other/privileges/AccessAdmin', { granted: true })
    await boss('PUT', '/api/users/u-other/privileges/StoreMidi', { granted: false })

    const said = await body<{ privileges: string[] }>(await other('GET', '/api/session'))
    expect(said.privileges).toEqual([PRIVILEGE.AccessAdmin])
  })
})

describe('an override row naming a privilege this build does not know', () => {
  test('is reported rather than acted on, and is not deleted by a write', async () => {
    const { person, repositories } = await world()
    const boss = await person('u-boss')
    await person('u-punter')

    const row = repositories.users.find('u-punter')!
    repositories.users.setOverride(row.id, 'AdminEverything', true, null)

    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-punter/privileges/AdminTags', { granted: true }),
    )
    expect(after.unknown).toEqual(['AdminEverything'])
    expect(repositories.users.overridesOf(row.id).unknown).toEqual(['AdminEverything'])
  })
})

/* The point of the boundary: taking AccessAdmin away has to close the routes
   behind it, not only hide the pages. Before this, every admin API stayed open
   to somebody who had just had it revoked. */
describe('AccessAdmin as a boundary', () => {
  /* Administered by grant rather than by PM_ADMINS, because an address the
     environment lists cannot have either door taken away — that is the way back
     into a locked-out install. Somebody handed the privileges here can. */
  const administered = async (
    boss: (method: string, path: string, payload?: unknown) => Promise<Response | null>,
    uid: string,
  ) => {
    for (const privilege of [PRIVILEGE.AccessAdmin, PRIVILEGE.AdminUsers, PRIVILEGE.AdminTags]) {
      await boss('PUT', `/api/users/${uid}/privileges/${privilege}`, { granted: true })
    }
  }

  test('closes the admin routes, not just the pages', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    const other = await person('u-other')
    await administered(boss, 'u-other')

    expect((await other('GET', '/api/tags/in-use'))!.status).toBe(200)
    expect((await other('GET', '/api/users'))!.status).toBe(200)

    await boss('PUT', '/api/users/u-other/privileges/AccessAdmin', { granted: false })

    expect((await other('GET', '/api/tags/in-use'))!.status).toBe(403)
    expect((await other('GET', '/api/users'))!.status).toBe(403)
  })

  test('leaves what does not depend on it alone', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    /* A tester, because that is the rung StoreMidi sits on and this test needs
       something outside administration to still be there afterwards. */
    const other = await person('u-other', [ROLE.tester])
    await administered(boss, 'u-other')

    await boss('PUT', '/api/users/u-other/privileges/AccessAdmin', { granted: false })

    expect((await other('GET', '/api/arrangements'))!.status).toBe(200)
  })

  test('is reported on the session, so the browser stops drawing the doors', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    const other = await person('u-other')
    await administered(boss, 'u-other')

    await boss('PUT', '/api/users/u-other/privileges/AccessAdmin', { granted: false })

    const said = await body<{ privileges: string[] }>(await other('GET', '/api/session'))
    expect(said.privileges).toEqual([])
  })
})

describe('the rules that keep an install reachable', () => {
  /* The page you would need to undo it is the one you are standing on. */
  test('refuse a self-revoke of the two doors', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    await person('u-spare')

    expect(
      (await boss('PUT', '/api/users/u-boss/privileges/AdminUsers', { granted: false }))!.status,
    ).toBe(400)
    expect(
      (await boss('PUT', '/api/users/u-boss/privileges/AccessAdmin', { granted: false }))!.status,
    ).toBe(400)
  })

  test('allow a self-revoke of anything else, which is the point of it', async () => {
    const { person } = await world()
    const boss = await person('u-boss')

    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-boss/privileges/AdminTags', { granted: false }),
    )
    expect(after.privileges).not.toContain(PRIVILEGE.AdminTags)
  })

  test('let somebody else take a door from you', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    await person('u-other')

    expect(
      (await boss('PUT', '/api/users/u-other/privileges/AccessAdmin', { granted: false }))!.status,
    ).toBe(200)
  })

  /* PM_ADMINS is the documented way back into a locked-out install, so a
     revoke must not be able to close it. */
  test('refuse to close the environment’s way back in', async () => {
    const { person } = await world(['u-boss', 'u-env'])
    const boss = await person('u-boss')
    await person('u-env')

    expect(
      (await boss('PUT', '/api/users/u-env/privileges/AdminUsers', { granted: false }))!.status,
    ).toBe(400)
  })

  test('still let one ordinary privilege off an environment admin', async () => {
    const { person } = await world(['u-boss', 'u-env'])
    const boss = await person('u-boss')
    await person('u-env')

    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-env/privileges/AdminTags', { granted: false }),
    )
    expect(after.privileges).not.toContain(PRIVILEGE.AdminTags)
    expect(after.privileges).toContain(PRIVILEGE.AccessAdmin)
  })

  /* The floor. A self-check cannot stop two administrators revoking each other
     at the same moment, so the count is taken again inside the write. */
  /* Taking it from one of two is fine; it is the last one that matters. */
  test('let one of two administrators be taken away', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    await person('u-other')
    for (const privilege of [PRIVILEGE.AccessAdmin, PRIVILEGE.AdminUsers]) {
      await boss('PUT', `/api/users/u-other/privileges/${privilege}`, { granted: true })
    }

    expect(
      (await boss('PUT', '/api/users/u-other/privileges/AdminUsers', { granted: false }))!.status,
    ).toBe(200)
    expect((await boss('GET', '/api/users'))!.status).toBe(200)
  })

  /* The sequential ways to reach nobody are all closed before the floor is
     reached: you cannot take a door from yourself, and you cannot take one from
     an address the environment lists — which, now that the role comes from
     there and nowhere else, is every administrator who did not receive the
     privileges by hand. The floor in `guarded` is what closes the concurrent
     case the checks above cannot see, and that is not reachable from one
     request. */
  test('never leave the last administrator unable to put it back', async () => {
    const { person } = await world()
    const boss = await person('u-boss')

    const refused = (await boss('PUT', '/api/users/u-boss/privileges/AdminUsers', {
      granted: false,
    }))!
    expect(refused.status).toBe(400)

    expect((await boss('GET', '/api/users'))!.status).toBe(200)
  })
})

describe('roles', () => {
  test('are assigned as roles and resolve to their privileges', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    await person('u-punter')

    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-punter/roles', { roles: [ROLE.tester] }),
    )
    expect(after.roles).toEqual([ROLE.tester])
  })

  /* Refused rather than quietly filtered: asking for one of these is asking for
     something this page cannot do, and silence would look like it worked. */
  test('refuse member, because everybody already is one', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    await person('u-punter')

    const refused = (await boss('PUT', '/api/users/u-punter/roles', {
      roles: [ROLE.member, ROLE.tester],
    }))!
    expect(refused.status).toBe(400)
  })

  /* The whole point of taking the role out of the column: there is one place
     that makes an administrator, and this is not it. */
  test('refuse admin, and say where it does come from', async () => {
    const { person } = await world()
    const boss = await person('u-boss')
    await person('u-punter')

    const refused = (await boss('PUT', '/api/users/u-punter/roles', { roles: [ROLE.admin] }))!
    expect(refused.status).toBe(400)
    expect((await refused.json()) as { error: string }).toMatchObject({
      error: expect.stringContaining('PM_ADMINS'),
    })

    const list = await body<AdminUser[]>(await boss('GET', '/api/users'))
    expect(found(list, 'u-punter').privileges).toEqual([])
  })

  /* There is nothing here to take away from them: the column never held it. */
  test('cannot be cleared to un-administer somebody the environment lists', async () => {
    const { person } = await world(['u-boss', 'u-env'])
    const boss = await person('u-boss')
    await person('u-env')

    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-env/roles', { roles: [] }),
    )
    expect(after.envAdmin).toBe(true)
    expect(after.privileges).toContain(PRIVILEGE.AdminUsers)
  })
})
