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

async function world(admins: readonly string[] = []) {
  const root = mkdtempSync(join(tmpdir(), 'moog-users-'))
  roots.push(root)
  const db = openDatabase(join(root, 'moog.db'))
  syncInstruments(db)

  const config = {
    ...authConfigFromEnv({ MOOG_SESSION_SECRET: SECRET }),
    mode: 'oauth' as const,
    secret: SECRET,
    admins,
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
    const boss = await person('u-boss', [ROLE.admin])

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
    const boss = await person('u-boss', [ROLE.admin])
    await person('u-punter')

    const list = await body<AdminUser[]>(await boss('GET', '/api/users'))
    const punter = found(list, 'u-punter')

    expect(punter.roles).toEqual([])
    expect(punter.privileges).toEqual([PRIVILEGE.StoreMidi])
    expect(found(list, 'u-boss').roles).toEqual([ROLE.admin])
  })

  test('counts what each account has made', async () => {
    const { person, repositories } = await world()
    const boss = await person('u-boss', [ROLE.admin])
    await person('u-maker')

    const maker = repositories.users.find('u-maker')!
    const patch = createPatch({ name: 'Theirs' })
    repositories.patches.create(patch, maker.id, patch.id)

    const list = await body<AdminUser[]>(await boss('GET', '/api/users'))
    expect(found(list, 'u-maker').stats.patches).toBe(1)
    expect(found(list, 'u-boss').stats.patches).toBe(0)
  })

  test('marks somebody the environment lists, whose admin role is not stored', async () => {
    const { person } = await world(['u-env@example.com'])
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
    const boss = await person('u-boss', [ROLE.admin])
    await person('u-punter')

    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-punter/privileges/AdminTags', { granted: true }),
    )
    expect(after.privileges).toContain(PRIVILEGE.AdminTags)
    expect(after.granted).toEqual([PRIVILEGE.AdminTags])
  })

  test('revokes one from an admin and leaves the others', async () => {
    const { person } = await world()
    const boss = await person('u-boss', [ROLE.admin])
    await person('u-other', [ROLE.admin])

    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-other/privileges/AdminTags', { granted: false }),
    )
    expect(after.privileges).not.toContain(PRIVILEGE.AdminTags)
    expect(after.privileges).toContain(PRIVILEGE.AccessAdmin)
    expect(after.revoked).toEqual([PRIVILEGE.AdminTags])
  })

  /* Inherited is the absence of a row, not a third stored state. */
  test('puts it back to inherited by deleting the row', async () => {
    const { person } = await world()
    const boss = await person('u-boss', [ROLE.admin])
    await person('u-other', [ROLE.admin])

    await boss('PUT', '/api/users/u-other/privileges/AdminTags', { granted: false })
    const after = await body<AdminUser>(
      await boss('DELETE', '/api/users/u-other/privileges/AdminTags'),
    )

    expect(after.revoked).toEqual([])
    expect(after.privileges).toContain(PRIVILEGE.AdminTags)
  })

  test('refuses a privilege it has never heard of', async () => {
    const { person } = await world()
    const boss = await person('u-boss', [ROLE.admin])

    expect(
      (await boss('PUT', '/api/users/u-boss/privileges/AdminEverything', { granted: true }))!
        .status,
    ).toBe(404)
  })

  test('needs a body that says which way', async () => {
    const { person } = await world()
    const boss = await person('u-boss', [ROLE.admin])
    await person('u-punter')

    expect(
      (await boss('PUT', '/api/users/u-punter/privileges/AdminTags', { granted: 'yes' }))!.status,
    ).toBe(400)
  })
})

describe('an override row naming a privilege this build does not know', () => {
  test('is reported rather than acted on, and is not deleted by a write', async () => {
    const { person, repositories } = await world()
    const boss = await person('u-boss', [ROLE.admin])
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

describe('the rules that keep an install reachable', () => {
  /* The page you would need to undo it is the one you are standing on. */
  test('refuse a self-revoke of the two doors', async () => {
    const { person } = await world()
    const boss = await person('u-boss', [ROLE.admin])
    await person('u-spare', [ROLE.admin])

    expect(
      (await boss('PUT', '/api/users/u-boss/privileges/AdminUsers', { granted: false }))!.status,
    ).toBe(400)
    expect(
      (await boss('PUT', '/api/users/u-boss/privileges/AccessAdmin', { granted: false }))!.status,
    ).toBe(400)
  })

  test('allow a self-revoke of anything else, which is the point of it', async () => {
    const { person } = await world()
    const boss = await person('u-boss', [ROLE.admin])

    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-boss/privileges/AdminTags', { granted: false }),
    )
    expect(after.privileges).not.toContain(PRIVILEGE.AdminTags)
  })

  test('let somebody else take a door from you', async () => {
    const { person } = await world()
    const boss = await person('u-boss', [ROLE.admin])
    await person('u-other', [ROLE.admin])

    expect(
      (await boss('PUT', '/api/users/u-other/privileges/AccessAdmin', { granted: false }))!.status,
    ).toBe(200)
  })

  /* MOOG_ADMINS is the documented way back into a locked-out install, so a
     revoke must not be able to close it. */
  test('refuse to close the environment’s way back in', async () => {
    const { person } = await world(['u-env@example.com'])
    const boss = await person('u-boss', [ROLE.admin])
    await person('u-env')

    expect(
      (await boss('PUT', '/api/users/u-env/privileges/AdminUsers', { granted: false }))!.status,
    ).toBe(400)
  })

  test('still let one ordinary privilege off an environment admin', async () => {
    const { person } = await world(['u-env@example.com'])
    const boss = await person('u-boss', [ROLE.admin])
    await person('u-env')

    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-env/privileges/AdminTags', { granted: false }),
    )
    expect(after.privileges).not.toContain(PRIVILEGE.AdminTags)
    expect(after.privileges).toContain(PRIVILEGE.AccessAdmin)
  })

  /* The floor. A self-check cannot stop two administrators revoking each other
     at the same moment, so the count is taken again inside the write. */
  test('refuse a write that would leave nobody able to administer users', async () => {
    const { person } = await world()
    const boss = await person('u-boss', [ROLE.admin])
    await person('u-other', [ROLE.admin])

    /* Two admins: taking it from one is fine. */
    expect(
      (await boss('PUT', '/api/users/u-other/privileges/AdminUsers', { granted: false }))!.status,
    ).toBe(200)

    /* One left, and it is the only one — so the role that carries it cannot go
       either. */
    const refused = (await boss('PUT', '/api/users/u-boss/roles', { roles: [] }))!
    expect(refused.status).toBe(409)
    expect((await refused.json()) as { error: string }).toMatchObject({
      error: expect.stringContaining('nobody'),
    })
  })

  test('leave the install as it was when the floor refuses', async () => {
    const { person } = await world()
    const boss = await person('u-boss', [ROLE.admin])

    await boss('PUT', '/api/users/u-boss/roles', { roles: [] })

    const list = await body<AdminUser[]>(await boss('GET', '/api/users'))
    expect(found(list, 'u-boss').roles).toEqual([ROLE.admin])
  })
})

describe('roles', () => {
  test('are assigned as presets and resolve to their privileges', async () => {
    const { person } = await world()
    const boss = await person('u-boss', [ROLE.admin])
    await person('u-punter')

    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-punter/roles', { roles: [ROLE.tester] }),
    )
    expect(after.roles).toEqual([ROLE.tester])
  })

  test('never store member, whoever asks for it', async () => {
    const { person } = await world()
    const boss = await person('u-boss', [ROLE.admin])
    await person('u-punter')

    const after = await body<AdminUser>(
      await boss('PUT', '/api/users/u-punter/roles', { roles: [ROLE.member, ROLE.tester] }),
    )
    expect(after.roles).toEqual([ROLE.tester])
  })

  test('cannot be taken off somebody the environment lists', async () => {
    const { person } = await world(['u-env@example.com'])
    const boss = await person('u-boss', [ROLE.admin])
    await person('u-env')

    expect((await boss('PUT', '/api/users/u-env/roles', { roles: [] }))!.status).toBe(400)
  })
})
