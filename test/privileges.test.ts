import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ASSIGNABLE_ROLES,
  DESCRIPTION,
  effectiveRoles,
  formatRoles,
  fromPreset,
  isPrivilege,
  parseRoles,
  presetFor,
  resolve,
  sourceOf,
  PRIVILEGE,
  PRIVILEGES,
  ROLE,
  ROLES,
} from '@access/privileges.ts'

describe('reading roles off a row', () => {
  test('takes the names it knows and drops the rest', () => {
    expect(parseRoles('admin,tester')).toEqual([ROLE.tester, ROLE.admin])
    /* A column written by a newer build must not stop an older one answering. */
    expect(parseRoles('tester,curator')).toEqual([ROLE.tester])
  })

  /* Literally, including a `member` an older build wrote. Dropping it here
     would let the next write put it straight back. */
  test('keeps a stored member rather than quietly correcting it', () => {
    expect(parseRoles('admin,member')).toEqual([ROLE.member, ROLE.admin])
  })

  test('tolerates spacing, repeats and an empty column', () => {
    expect(parseRoles(' admin , tester , admin ')).toEqual([ROLE.tester, ROLE.admin])
    expect(parseRoles('')).toEqual([])
    expect(parseRoles(null)).toEqual([])
  })

  /* Everybody is a member, so writing it says nothing and would come back as a
     third kind of account in the admin page. */
  test('never writes member back out', () => {
    expect(formatRoles([ROLE.member, ROLE.admin])).toBe('admin')
    expect(formatRoles([ROLE.member])).toBe('')
  })
})

describe('who somebody counts as', () => {
  test('is a member before anything is stored', () => {
    expect(effectiveRoles([])).toEqual([ROLE.member])
  })

  /* Added per request rather than written to the column, so taking the address
     out of MOOG_ADMINS takes the role away again. */
  test('adds admin for an address the environment lists', () => {
    expect(effectiveRoles([], true)).toEqual([ROLE.member, ROLE.admin])
  })

  test('does not double up a role that is both stored and listed', () => {
    expect(effectiveRoles([ROLE.admin], true)).toEqual([ROLE.member, ROLE.admin])
  })

  test('member is not something you can be given, because everyone is', () => {
    expect(ASSIGNABLE_ROLES).not.toContain(ROLE.member)
    expect(ASSIGNABLE_ROLES).toEqual([ROLE.tester, ROLE.admin])
  })
})

describe('resolving what somebody may do', () => {
  test('gives the baseline to an account holding no role at all', () => {
    expect(resolve([])).toEqual([PRIVILEGE.StoreMidi])
  })

  test('gives an admin the whole preset', () => {
    const held = resolve([ROLE.member, ROLE.admin])
    expect(held).toContain(PRIVILEGE.AccessAdmin)
    expect(held).toContain(PRIVILEGE.AdminUsers)
    expect(held).toContain(PRIVILEGE.StoreMidi)
  })

  test('adds what was granted to this account alone', () => {
    expect(resolve([], { granted: [PRIVILEGE.AdminTags] })).toContain(PRIVILEGE.AdminTags)
  })

  /* The whole point of a revoke: one privilege off, everything else intact. */
  test('takes back what was revoked, even from a preset', () => {
    const held = resolve([ROLE.member, ROLE.admin], { revoked: [PRIVILEGE.AdminTags] })
    expect(held).not.toContain(PRIVILEGE.AdminTags)
    expect(held).toContain(PRIVILEGE.AccessAdmin)
  })

  test('a revoke beats a grant on the same privilege', () => {
    expect(
      resolve([], { granted: [PRIVILEGE.AdminTags], revoked: [PRIVILEGE.AdminTags] }),
    ).not.toContain(PRIVILEGE.AdminTags)
  })

  test('can leave an account holding nothing at all', () => {
    expect(resolve([], { revoked: [PRIVILEGE.StoreMidi] })).toEqual([])
  })

  test('answers in the catalogue order, so two equal sets are equal lists', () => {
    expect(resolve([ROLE.admin])).toEqual(resolve([ROLE.admin, ROLE.member]))
  })
})

describe('where an answer came from', () => {
  test('says the preset when nothing was said about this account', () => {
    expect(sourceOf([ROLE.admin], PRIVILEGE.AdminTags)).toBe('preset')
    expect(sourceOf([], PRIVILEGE.StoreMidi)).toBe('preset')
  })

  test('says nothing gives it, where nothing does', () => {
    expect(sourceOf([], PRIVILEGE.AdminTags)).toBe('none')
  })

  test('names the override where there is one', () => {
    expect(sourceOf([], PRIVILEGE.AdminTags, { granted: [PRIVILEGE.AdminTags] })).toBe('granted')
    expect(sourceOf([ROLE.admin], PRIVILEGE.AdminTags, { revoked: [PRIVILEGE.AdminTags] })).toBe(
      'revoked',
    )
  })

  /* What the editor flags as saying nothing: granting something the role
     already gives is only visible once the role goes away. */
  test('can tell a grant that duplicates a preset', () => {
    expect(fromPreset([ROLE.admin], PRIVILEGE.AdminTags)).toBe(true)
    expect(fromPreset([], PRIVILEGE.AdminTags)).toBe(false)
  })
})

describe('the catalogue', () => {
  test('describes every privilege, for whoever is handing it over', () => {
    for (const privilege of PRIVILEGES) {
      expect(DESCRIPTION[privilege].length).toBeGreaterThan(20)
    }
  })

  test('knows only names it declares', () => {
    expect(isPrivilege(PRIVILEGE.AdminUsers)).toBe(true)
    expect(isPrivilege('AdminEverything')).toBe(false)
    expect(isPrivilege(null)).toBe(false)
  })

  test('has a preset for every role', () => {
    for (const role of ROLES) expect(Array.isArray(presetFor(role))).toBe(true)
  })
})

/* Override rows store privilege names and the roles column stores role names,
   so both are a published interface. A rename fails in the dangerous direction:
   an orphaned revoke stops applying while the gate lives on under the new name,
   which quietly hands access back. When this fails the fix is to restore the
   old name, not to edit the lock. */
describe('the name lock', () => {
  const lock = JSON.parse(
    readFileSync(join(import.meta.dir, 'privilege-names.lock.json'), 'utf8'),
  ) as { privileges: string[]; roles: string[] }

  test('still declares every privilege name ever shipped', () => {
    for (const name of lock.privileges) {
      expect(PRIVILEGES as readonly string[]).toContain(name)
    }
  })

  test('still declares every role name ever shipped', () => {
    for (const name of lock.roles) {
      expect(ROLES as readonly string[]).toContain(name)
    }
  })

  /* Add-only, so a new name has to be written down as it ships rather than
     remembered later. */
  test('records every name this build declares', () => {
    for (const name of PRIVILEGES) expect(lock.privileges).toContain(name)
    for (const name of ROLES) expect(lock.roles).toContain(name)
  })
})
