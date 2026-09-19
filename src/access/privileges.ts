/* What a person is allowed to do, named once for both sides. The server decides
   and the client only draws: a hidden button is a courtesy, never the check.

   Three vocabularies, deliberately unlike each other:

   A **privilege** is a thing the code can do. Adding one is this file plus the
   route that asks for it, and never a migration. Renaming one is not free:
   `user_privileges` stores the name, so the names are a published interface in
   the same way control ids are, and `test/privilege-names.lock.json` records
   every one ever shipped. A rename fails in the dangerous direction — an
   orphaned *revoke* stops applying while the gate lives on under the new name —
   so restore the old name rather than edit the lock.

   A **role** is a named set of privileges, stored against a user. It is stored
   rather than stamped out as individual grants because that is what keeps it
   live — changing a rung below reaches everyone who holds the role, with no
   write. Role names are stored too; add roles, never rename one.

   An **override** is one person's answer for one privilege, and beats the role
   either way. */

export const PRIVILEGE = {
  /* The administration area at all. Holding it opens the door; what is behind
     each panel in there is its own privilege, so a tag curator does not also
     get the user list. */
  AccessAdmin: 'AccessAdmin',
  AdminUsers: 'AdminUsers',
  AdminTags: 'AdminTags',
  AdminLayout: 'AdminLayout',
  /* Editing, deleting and unpublishing a patch that belongs to somebody else.
     Factory content is still refused to everybody holding it: the bank comes
     from the image and a write would be overwritten at the next start. */
  AdminPatches: 'AdminPatches',
  /* The housekeeping this install does to itself: backups, the nightly purge,
     the bank it seeded and the limits it enforces. Its own privilege rather
     than AccessAdmin, because it says how the install is tuned and where its
     backups are written, and handing somebody the tag list should not hand
     them that as well. */
  AdminOps: 'AdminOps',
  StoreMidi: 'StoreMidi',
} as const

export type Privilege = (typeof PRIVILEGE)[keyof typeof PRIVILEGE]

export const PRIVILEGES: readonly Privilege[] = Object.values(PRIVILEGE)

/* What the row is called where somebody is handing it over. The name beside it
   is the stored one and stays exact; this is the same thing said in words, so a
   list of six reads as six things a person can do rather than six identifiers.

   A Record, so a privilege added without one fails to typecheck. */
export const TITLE: Record<Privilege, string> = {
  AccessAdmin: 'Be an administrator',
  AdminUsers: 'Manage people and their access',
  AdminTags: 'Keep the tag list',
  AdminLayout: 'Try out the layout',
  AdminPatches: 'Edit anybody’s patch',
  AdminOps: 'See how the server is running',
  StoreMidi: 'Save MIDI arrangements',
}

/* The long form, behind the info icon on each row. Written for somebody
   deciding whether to hand it over, which is why these say what it lets a
   person do rather than why the code is arranged this way.

   A Record, so a privilege added without a description fails to typecheck. */
export const DESCRIPTION: Record<Privilege, string> = {
  AccessAdmin:
    'Be an administrator at all. Every other administrative privilege is conditional on this one, so taking it away takes back everything behind it as well as hiding the pages.',
  AdminUsers:
    'See everyone with an account, and grant or revoke what they may do. Whoever holds this can change their own access and everybody else’s.',
  AdminTags:
    'Keep the list of categories the save form offers, and see how many patches wear each one. Retiring a tag leaves every patch already wearing it untouched.',
  AdminLayout:
    'Open the Layout page, try the app’s colours out on this browser, and export a prompt that changes the ones it ships with. Nothing done there repaints the app for anybody else.',
  AdminPatches:
    'Edit, delete or unpublish a patch belonging to somebody else, and correct a patch in the factory bank when it was transcribed wrong. Correcting one changes it for everybody here and survives a restart. Retiring a factory patch is refused to everybody, including whoever holds this.',
  AdminOps:
    'See what this server has done since it started: the last backup and whether it worked, the last sweep of the trash, the bank it seeded and the limits it holds people to. Nothing on that page changes anything.',
  StoreMidi:
    'Save a MIDI file together with the sound put on each of its parts, and open it again later.',
}

export const ROLE = {
  member: 'member',
  tester: 'tester',
  admin: 'admin',
} as const

export type Role = (typeof ROLE)[keyof typeof ROLE]

export const ROLES: readonly Role[] = Object.values(ROLE)

/* The only role anybody is given. The other two are facts rather than
   decisions, and neither is ever written to a row:

   `member` is what every signed-in account is, applied at resolution rather
   than stored, so unlocking a basic feature reaches everyone with no write.

   `admin` comes from `MOOG_ADMINS` and nowhere else. Storing it as well gave
   one fact two sources, which is what let a column go on claiming an admin the
   environment had stopped naming. Somebody who needs one administrative power
   without being an administrator is given that privilege, not the role. */
export const ASSIGNABLE_ROLES: readonly Role[] = [ROLE.tester]

export function isAssignable(role: Role): boolean {
  return ASSIGNABLE_ROLES.includes(role)
}

/* The rungs, lowest first. A role holds everything the rungs below it hold, so
   a privilege given to members reaches testers and admins without being listed
   three times — and one line unlocks a feature for everyone above it.

   Written out rather than taken from `ROLES`, whose order is only the order the
   keys happen to be declared in. This is a designed order and says so. */
export const ROLE_LADDER: readonly Role[] = [ROLE.member, ROLE.tester, ROLE.admin]

/* What each rung *adds*, never what it ends up with. Re-listing an inherited
   privilege is how the two drift: the admin role used to repeat StoreMidi,
   and the day a second one was given to members it would not have been
   repeated. */
const ADDS: Record<Role, readonly Privilege[]> = {
  /* Nothing. Signing in is not itself permission to do anything, and the rung
     stays because it is where a privilege everybody should have would go —
     one line, reaching every account with no write. */
  member: [],
  tester: [PRIVILEGE.StoreMidi],
  admin: [
    PRIVILEGE.AccessAdmin,
    PRIVILEGE.AdminUsers,
    PRIVILEGE.AdminTags,
    PRIVILEGE.AdminLayout,
    PRIVILEGE.AdminPatches,
    PRIVILEGE.AdminOps,
  ],
}

/* Everything up to and including this rung. An unknown role is nothing rather
   than a throw: it can only arrive from a column a newer build wrote, and the
   rest of this file drops those too. */
export function privilegesOf(role: Role): readonly Privilege[] {
  const rung = ROLE_LADDER.indexOf(role)
  if (rung < 0) return []

  const held = new Set<Privilege>()
  for (const below of ROLE_LADDER.slice(0, rung + 1)) {
    for (const privilege of ADDS[below]) held.add(privilege)
  }
  return PRIVILEGES.filter((privilege) => held.has(privilege))
}

/* What this rung alone puts on the table: what it holds that the rung below
   does not. Derived rather than read from `ADDS`, so the list shown beside a
   role cannot claim something `privilegesOf` would not hand over. */
export function addedBy(role: Role): readonly Privilege[] {
  const rung = ROLE_LADDER.indexOf(role)
  if (rung < 0) return []

  const below = rung === 0 ? [] : privilegesOf(ROLE_LADDER[rung - 1] as Role)
  return privilegesOf(role).filter((privilege) => !below.includes(privilege))
}

/* What a privilege is conditional on. `AccessAdmin` is a boundary rather than a
   door: without it the administration privileges do not apply at all, so taking
   it away de-administers somebody everywhere at once instead of hiding pages
   whose routes would still have answered.

   Written here rather than as a second entry on every admin route, because a
   route that forgot the second entry is exactly the hole this closes — and
   because the routes are not the only place these are asked about. Editing
   somebody else's patch is checked in the patches service, and the browser
   draws from the same resolved list. */
export const REQUIRES: Partial<Record<Privilege, Privilege>> = {
  [PRIVILEGE.AdminUsers]: PRIVILEGE.AccessAdmin,
  [PRIVILEGE.AdminTags]: PRIVILEGE.AccessAdmin,
  [PRIVILEGE.AdminLayout]: PRIVILEGE.AccessAdmin,
  [PRIVILEGE.AdminPatches]: PRIVILEGE.AccessAdmin,
  [PRIVILEGE.AdminOps]: PRIVILEGE.AccessAdmin,
}

export function requiredBy(privilege: Privilege): Privilege | null {
  return REQUIRES[privilege] ?? null
}

/* Which half of the editor a privilege belongs under. Read off `REQUIRES`
   rather than kept as a third list: administration is exactly what
   `AccessAdmin` gates plus `AccessAdmin` itself, so a privilege added with its
   prerequisite lands in the right group with no second edit to forget. */
export function isAdministrative(privilege: Privilege): boolean {
  return privilege === PRIVILEGE.AccessAdmin || requiredBy(privilege) === PRIVILEGE.AccessAdmin
}

/* The two that must not be revoked away from everybody: `AccessAdmin` because
   every administrative privilege is conditional on it, `AdminUsers` because it
   is the one that can put the rest back. Which writes are actually refused, and
   why, is the server's to say; the list is here because the editor has to draw
   them locked, and a second copy of it is one that drifts. */
export const PROTECTED: readonly Privilege[] = [PRIVILEGE.AccessAdmin, PRIVILEGE.AdminUsers]

export function isProtected(privilege: Privilege): boolean {
  return PROTECTED.includes(privilege)
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export function isPrivilege(value: unknown): value is Privilege {
  return typeof value === 'string' && (PRIVILEGES as readonly string[]).includes(value)
}

/* Literal: what the column says, including a `member` written by an older
   build. Implicitness belongs to `resolve` alone, because putting it here would
   let the next `grant` write `member` straight back into the column. */
export function parseRoles(stored: string | null | undefined): Role[] {
  if (!stored) return []
  const held = new Set<Role>()
  for (const part of stored.split(',')) {
    const name = part.trim()
    if (isRole(name)) held.add(name)
  }
  return ROLES.filter((role) => held.has(role))
}

/* Only what is actually given. `member` and `admin` are worked out rather than
   stored, so letting either into the column would put a second source next to
   the one that decides. */
export function formatRoles(roles: readonly Role[]): string {
  return [...new Set(roles)].filter(isAssignable).join(',')
}

/* Who somebody counts as. `member` always, and `admin` for an address the
   environment lists — added here rather than written to the column, so removing
   the line takes the role away again. */
export function effectiveRoles(stored: readonly Role[], envAdmin = false): Role[] {
  /* Only the assignable ones are taken from the row. An `admin` left in a
     column by an older build is ignored rather than honoured, so the
     environment stays the only thing that makes one. */
  const held = new Set<Role>([ROLE.member, ...stored.filter(isAssignable)])
  if (envAdmin) held.add(ROLE.admin)
  return ROLES.filter((role) => held.has(role))
}

export interface Overrides {
  readonly granted?: readonly Privilege[]
  readonly revoked?: readonly Privilege[]
}

/* The whole rule, in one place and in this order:

     base    = what the roles give, member included
     granted = base + what this account was handed
     final   = granted - what this account had taken away

   A revoke wins over everything, including the admin role and including an
   address listed in the environment — which is what lets somebody take one
   privilege off themselves to see what everybody else sees. Being listed in the
   environment is protected at the point a revoke is *written*, not here, so
   this stays a rule rather than a rule with an exception. */
export function resolve(roles: readonly Role[], overrides: Overrides = {}): Privilege[] {
  /* Member first and unconditionally: it is not stored, so it does not arrive
     in `roles`, and every signed-in account is one. */
  const held = new Set<Privilege>(privilegesOf(ROLE.member))
  for (const role of roles) for (const privilege of privilegesOf(role)) held.add(privilege)
  for (const privilege of overrides.granted ?? []) held.add(privilege)
  for (const privilege of overrides.revoked ?? []) held.delete(privilege)

  /* Last, and repeatedly, so that a privilege whose prerequisite has just been
     dropped goes with it. An explicit grant does not survive this: a boundary
     that one grant could step over would not be a boundary. */
  for (let settling = true; settling; ) {
    settling = false
    for (const privilege of held) {
      const needs = REQUIRES[privilege]
      if (needs !== undefined && !held.has(needs)) {
        held.delete(privilege)
        settling = true
      }
    }
  }

  /* Filtered rather than spread, so the order is the catalogue's and two equal
     sets are equal lists. */
  return PRIVILEGES.filter((privilege) => held.has(privilege))
}

/* Where an answer came from, which is what the editor shows under each row. */
export type Source = 'role' | 'granted' | 'revoked' | 'none'

export function sourceOf(
  roles: readonly Role[],
  privilege: Privilege,
  overrides: Overrides = {},
): Source {
  if ((overrides.revoked ?? []).includes(privilege)) return 'revoked'
  if ((overrides.granted ?? []).includes(privilege)) return 'granted'
  return fromRole(roles, privilege) ? 'role' : 'none'
}

export function fromRole(roles: readonly Role[], privilege: Privilege): boolean {
  return roleGiving(roles, privilege) !== null
}

/* Which role is answering, so a row can name it instead of saying "a role".
   The lowest rung that carries it, because that is the one whose removal would
   actually take it away — a higher rung only inherits what is already there.
   Member is counted whatever was passed, since everybody is one. */
export function roleGiving(roles: readonly Role[], privilege: Privilege): Role | null {
  const held = new Set<Role>([ROLE.member, ...roles])
  return (
    ROLE_LADDER.find((role) => held.has(role) && privilegesOf(role).includes(privilege)) ?? null
  )
}
