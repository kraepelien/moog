import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  addedBy,
  ASSIGNABLE_ROLES,
  DESCRIPTION,
  isAdministrative,
  roleGiving,
  TITLE,
  effectiveRoles,
  formatRoles,
  fromRole,
  isPrivilege,
  parseRoles,
  privilegesOf,
  requiredBy,
  resolve,
  sourceOf,
  PRIVILEGE,
  PRIVILEGES,
  ROLE,
  ROLES,
  ROLE_LADDER,
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

  /* Only what is actually given goes in the column. Everybody is a member, and
     an admin is one because the environment says so — writing either would put
     a second source next to the one that decides. */
  test('writes only the roles that are given', () => {
    expect(formatRoles([ROLE.member, ROLE.tester])).toBe('tester')
    expect(formatRoles([ROLE.member])).toBe('')
    expect(formatRoles([ROLE.admin])).toBe('')
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

  /* Neither of the other two is a decision: everybody is a member, and an admin
     is one because MOOG_ADMINS says so. Tester is the only thing anybody is
     flagged as. */
  test('leaves only tester to be given', () => {
    expect(ASSIGNABLE_ROLES).toEqual([ROLE.tester])
    expect(ASSIGNABLE_ROLES).not.toContain(ROLE.member)
    expect(ASSIGNABLE_ROLES).not.toContain(ROLE.admin)
  })

  /* A row that still says admin, from a build that stored it. Resolution takes
     the environment's word and ignores the column's. */
  test('ignores an admin left in a column by an older build', () => {
    expect(effectiveRoles([ROLE.admin])).toEqual([ROLE.member])
    expect(effectiveRoles([ROLE.admin], true)).toEqual([ROLE.member, ROLE.admin])
  })

  test('still takes a stored tester, which is a real flag', () => {
    expect(effectiveRoles([ROLE.tester])).toEqual([ROLE.member, ROLE.tester])
  })
})

describe('resolving what somebody may do', () => {
  /* Signing in is not itself permission to do anything. The member rung is
     where a privilege everybody should have would go, and today nothing is
     there. */
  test('gives nothing to an account holding no role at all', () => {
    expect(resolve([])).toEqual([])
  })

  test('gives a tester what that rung carries', () => {
    expect(resolve([ROLE.tester])).toEqual([PRIVILEGE.StoreMidi])
  })

  test('gives an admin everything the role holds', () => {
    const held = resolve([ROLE.member, ROLE.admin])
    expect(held).toContain(PRIVILEGE.AccessAdmin)
    expect(held).toContain(PRIVILEGE.AdminUsers)
    expect(held).toContain(PRIVILEGE.StoreMidi)
  })

  test('adds what was granted to this account alone', () => {
    expect(
      resolve([], { granted: [PRIVILEGE.AccessAdmin, PRIVILEGE.AdminTags] }),
    ).toContain(PRIVILEGE.AdminTags)
  })

  /* The whole point of a revoke: one privilege off, everything else intact. */
  test('takes back what was revoked, even from a role', () => {
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
    expect(resolve([ROLE.tester], { revoked: [PRIVILEGE.StoreMidi] })).toEqual([])
  })

  test('answers in the catalogue order, so two equal sets are equal lists', () => {
    expect(resolve([ROLE.admin])).toEqual(resolve([ROLE.admin, ROLE.member]))
  })
})

/* AccessAdmin is a boundary, not a door: without it the administration
   privileges do not apply at all, so revoking it de-administers somebody
   everywhere rather than hiding pages whose routes would still have answered. */
describe('what AccessAdmin is conditional on', () => {
  test('drops every administration privilege the admin role gives', () => {
    const held = resolve([ROLE.member, ROLE.admin], { revoked: [PRIVILEGE.AccessAdmin] })

    expect(held).toEqual([PRIVILEGE.StoreMidi])
    expect(held).not.toContain(PRIVILEGE.AdminTags)
    expect(held).not.toContain(PRIVILEGE.AdminUsers)
    expect(held).not.toContain(PRIVILEGE.AdminPatches)
  })

  /* A boundary one grant could step over would not be a boundary. */
  test('is not something an explicit grant can get around', () => {
    expect(resolve([], { granted: [PRIVILEGE.AdminUsers] })).not.toContain(PRIVILEGE.AdminUsers)
    expect(
      resolve([ROLE.admin], {
        revoked: [PRIVILEGE.AccessAdmin],
        granted: [PRIVILEGE.AdminUsers],
      }),
    ).not.toContain(PRIVILEGE.AdminUsers)
  })

  test('leaves what does not depend on it alone', () => {
    expect(resolve([ROLE.member, ROLE.admin], { revoked: [PRIVILEGE.AccessAdmin] })).toContain(
      PRIVILEGE.StoreMidi,
    )
  })

  test('says which privilege each one waits on', () => {
    expect(requiredBy(PRIVILEGE.AdminTags)).toBe(PRIVILEGE.AccessAdmin)
    expect(requiredBy(PRIVILEGE.StoreMidi)).toBeNull()
    expect(requiredBy(PRIVILEGE.AccessAdmin)).toBeNull()
  })

  /* Every Admin* privilege, so adding one without a prerequisite is caught
     rather than quietly becoming reachable without being an administrator. */
  test('covers every administration privilege there is', () => {
    for (const privilege of PRIVILEGES) {
      if (privilege === PRIVILEGE.AccessAdmin || !privilege.startsWith('Admin')) continue
      expect(requiredBy(privilege)).toBe(PRIVILEGE.AccessAdmin)
    }
  })
})

describe('where an answer came from', () => {
  test('says the role when nothing was said about this account', () => {
    expect(sourceOf([ROLE.admin], PRIVILEGE.AdminTags)).toBe('role')
    expect(sourceOf([ROLE.tester], PRIVILEGE.StoreMidi)).toBe('role')
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
  test('can tell a grant that duplicates a role', () => {
    expect(fromRole([ROLE.admin], PRIVILEGE.AdminTags)).toBe(true)
    expect(fromRole([], PRIVILEGE.AdminTags)).toBe(false)
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

  test('has a privilege list for every role', () => {
    for (const role of ROLES) expect(Array.isArray(privilegesOf(role))).toBe(true)
  })

  /* The row's own label, so a list of six reads as six things a person can do.
     Short, because it sits beside a control and not in a paragraph. */
  test('titles every privilege, distinctly and without repeating the name', () => {
    const titles = PRIVILEGES.map((privilege) => TITLE[privilege])
    expect(new Set(titles).size).toBe(PRIVILEGES.length)

    for (const privilege of PRIVILEGES) {
      expect(TITLE[privilege].length).toBeGreaterThan(3)
      expect(TITLE[privilege]).not.toBe(privilege)
    }
  })
})

/* Which half of the editor a privilege is drawn under. Read off REQUIRES
   rather than kept as a third list, so a privilege added with its prerequisite
   lands in the right group with no second edit to forget. */
describe('telling administration from the rest', () => {
  test('counts AccessAdmin and everything conditional on it', () => {
    expect(isAdministrative(PRIVILEGE.AccessAdmin)).toBe(true)
    expect(isAdministrative(PRIVILEGE.AdminUsers)).toBe(true)
    expect(isAdministrative(PRIVILEGE.AdminPatches)).toBe(true)
  })

  test('leaves out what does not depend on it', () => {
    expect(isAdministrative(PRIVILEGE.StoreMidi)).toBe(false)
  })

  /* Every privilege lands in exactly one of the two halves, so none can be
     left out of the editor by being in neither. */
  test('puts every privilege on one side or the other', () => {
    const administrative = PRIVILEGES.filter(isAdministrative)
    const rest = PRIVILEGES.filter((privilege) => !isAdministrative(privilege))
    expect(administrative.length + rest.length).toBe(PRIVILEGES.length)
    expect(administrative.length).toBeGreaterThan(0)
  })

  /* The same set the admin role carries, which is what makes the grouping a
     reading of the rules rather than a second opinion about them. */
  test('agrees with what the admin rung adds', () => {
    expect(addedBy(ROLE.admin).every(isAdministrative)).toBe(true)
  })
})

/* What a rung puts on the table by itself, which is what the editor shows
   beside the button that gives the role. */
describe('what a role adds', () => {
  test('is what it holds that the rung below does not', () => {
    expect(addedBy(ROLE.member)).toEqual([])
    expect(addedBy(ROLE.tester)).toEqual([PRIVILEGE.StoreMidi])
    expect(addedBy(ROLE.admin)).not.toContain(PRIVILEGE.StoreMidi)
    expect(addedBy(ROLE.admin)).toContain(PRIVILEGE.AdminUsers)
  })

  /* The rungs partition the catalogue between them, so nothing a role gives is
     missing from every card and nothing is listed on two. */
  test('accounts for everything the top rung holds, exactly once', () => {
    const listed = ROLE_LADDER.flatMap((role) => addedBy(role))
    expect(new Set(listed).size).toBe(listed.length)
    expect([...listed].sort()).toEqual([...privilegesOf(ROLE.admin)].sort())
  })

  test('is nothing for a role off the ladder', () => {
    expect(addedBy('curator' as never)).toEqual([])
  })
})

/* Which role is answering, so a row can name it instead of saying "a role" —
   and naming it says which one would have to go. */
describe('the role that gives a privilege', () => {
  test('names the rung it sits on', () => {
    expect(roleGiving([ROLE.tester], PRIVILEGE.StoreMidi)).toBe(ROLE.tester)
    expect(roleGiving([ROLE.admin], PRIVILEGE.AdminTags)).toBe(ROLE.admin)
  })

  /* The lowest, because a higher rung only inherits what is already there:
     taking the admin role off somebody who is also a tester does not take
     StoreMidi with it. */
  test('names the lowest rung carrying it, not the one being held', () => {
    expect(roleGiving([ROLE.tester, ROLE.admin], PRIVILEGE.StoreMidi)).toBe(ROLE.tester)
  })

  test('counts member whatever was passed, since everybody is one', () => {
    for (const privilege of privilegesOf(ROLE.member)) {
      expect(roleGiving([], privilege)).toBe(ROLE.member)
    }
  })

  test('is nothing where no role the account holds gives it', () => {
    expect(roleGiving([], PRIVILEGE.StoreMidi)).toBeNull()
    expect(roleGiving([ROLE.tester], PRIVILEGE.AdminTags)).toBeNull()
  })

  /* `fromRole` is this question asked as a yes or no, so the two cannot drift
     into disagreeing about the same account. */
  test('agrees with fromRole on every privilege', () => {
    for (const roles of [[], [ROLE.tester], [ROLE.member, ROLE.admin]]) {
      for (const privilege of PRIVILEGES) {
        expect(fromRole(roles, privilege)).toBe(roleGiving(roles, privilege) !== null)
      }
    }
  })
})

/* The rungs. A role holds what the rungs below it hold, so unlocking a feature
   for members is one line and reaches testers and admins with it — which
   matters because the roles are code: it takes a deploy either way, and the
   deploy should not also need each higher role edited to match. */
describe('a role inheriting from the ones below it', () => {
  test('gives an admin everything a member has', () => {
    for (const privilege of privilegesOf(ROLE.member)) {
      expect(privilegesOf(ROLE.admin)).toContain(privilege)
    }
  })

  test('gives a tester everything a member has', () => {
    for (const privilege of privilegesOf(ROLE.member)) {
      expect(privilegesOf(ROLE.tester)).toContain(privilege)
    }
  })

  /* Stated over the whole ladder rather than the pairs that exist today, so a
     rung inserted later is held to it too. */
  test('holds for every step of the ladder', () => {
    ROLE_LADDER.forEach((role, rung) => {
      if (rung === 0) return
      const below = privilegesOf(ROLE_LADDER[rung - 1]!)
      for (const privilege of below) expect(privilegesOf(role)).toContain(privilege)
    })
  })

  /* A role off the ladder would silently grant nothing, which is the confusing
     way to find out it was forgotten. */
  test('places every role there is', () => {
    for (const role of ROLES) expect(ROLE_LADDER).toContain(role)
  })

  /* Inheritance is not a way around an override: the whole point of a revoke is
     that it comes last. */
  test('is still beaten by a revoke', () => {
    expect(
      resolve([ROLE.member, ROLE.admin], { revoked: [PRIVILEGE.StoreMidi] }),
    ).not.toContain(PRIVILEGE.StoreMidi)
  })

  test('gives each rung what it and everything below it carries', () => {
    expect(resolve([ROLE.member])).toEqual([])
    expect(resolve([ROLE.member, ROLE.tester])).toEqual([PRIVILEGE.StoreMidi])
    expect(resolve([ROLE.member, ROLE.admin])).toEqual([
      PRIVILEGE.AccessAdmin,
      PRIVILEGE.AdminUsers,
      PRIVILEGE.AdminTags,
      PRIVILEGE.AdminLayout,
      PRIVILEGE.AdminPatches,
      PRIVILEGE.StoreMidi,
    ])
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
