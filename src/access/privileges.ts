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

   A **role** is a preset: a named set of privileges, stored against a user. It
   is stored rather than stamped out as individual grants because that is what
   keeps a preset live — changing PRESETS below reaches everyone who holds the
   role, with no write. Role names are stored too; add roles, never rename one.

   An **override** is one person's answer for one privilege, and beats the
   preset either way. */

export const PRIVILEGE = {
  /* The administration area at all. Holding it opens the door; what is behind
     each panel in there is its own privilege, so a tag curator does not also
     get the user list. */
  AccessAdmin: 'AccessAdmin',
  AdminUsers: 'AdminUsers',
  AdminTags: 'AdminTags',
  /* Editing, deleting and unpublishing a patch that belongs to somebody else.
     Factory content is still refused to everybody holding it: the bank comes
     from the image and a write would be overwritten at the next start. */
  AdminPatches: 'AdminPatches',
  StoreMidi: 'StoreMidi',
} as const

export type Privilege = (typeof PRIVILEGE)[keyof typeof PRIVILEGE]

export const PRIVILEGES: readonly Privilege[] = Object.values(PRIVILEGE)

/* Shown beside each privilege where it is granted. Written for somebody
   deciding whether to hand it over, which is why these say what it lets a
   person do rather than why the code is arranged this way.

   A Record, so a privilege added without a description fails to typecheck. */
export const DESCRIPTION: Record<Privilege, string> = {
  AccessAdmin:
    'Open the administration area. This is the door only — it does not by itself allow anything inside, and taking it away hides the pages without taking back what the account may do there.',
  AdminUsers:
    'See everyone with an account, and grant or revoke what they may do. Whoever holds this can change their own access and everybody else’s.',
  AdminTags:
    'Keep the list of categories the save form offers, and see how many patches wear each one. Retiring a tag leaves every patch already wearing it untouched.',
  AdminPatches:
    'Edit, delete or unpublish a patch belonging to somebody else. Factory presets stay read-only for everyone.',
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

/* `member` is not among these: it is what every signed-in account is, applied
   at resolution and never stored, so no row can end up with no privileges at
   all and unlocking a basic feature reaches everyone with no write. */
export const ASSIGNABLE_ROLES: readonly Role[] = [ROLE.tester, ROLE.admin]

const PRESETS: Record<Role, readonly Privilege[]> = {
  member: [PRIVILEGE.StoreMidi],
  /* Nothing yet. It exists so a beta privilege can be handed to a group in one
     line rather than to each person by hand. */
  tester: [],
  admin: [
    PRIVILEGE.AccessAdmin,
    PRIVILEGE.AdminUsers,
    PRIVILEGE.AdminTags,
    PRIVILEGE.AdminPatches,
    PRIVILEGE.StoreMidi,
  ],
}

export function presetFor(role: Role): readonly Privilege[] {
  return PRESETS[role]
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

/* Drops `member` defensively, so no write can reintroduce what resolution
   already applies to everybody. */
export function formatRoles(roles: readonly Role[]): string {
  return [...new Set(roles)].filter((role) => role !== ROLE.member).join(',')
}

/* Who somebody counts as. `member` always, and `admin` for an address the
   environment lists — added here rather than written to the column, so removing
   the line takes the role away again. */
export function effectiveRoles(stored: readonly Role[], envAdmin = false): Role[] {
  const held = new Set<Role>([ROLE.member, ...stored])
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
  const held = new Set<Privilege>(PRESETS[ROLE.member])
  for (const role of roles) for (const privilege of PRESETS[role]) held.add(privilege)
  for (const privilege of overrides.granted ?? []) held.add(privilege)
  for (const privilege of overrides.revoked ?? []) held.delete(privilege)
  /* Filtered rather than spread, so the order is the catalogue's and two equal
     sets are equal lists. */
  return PRIVILEGES.filter((privilege) => held.has(privilege))
}

/* Where an answer came from, which is what the editor shows under each row. */
export type Source = 'preset' | 'granted' | 'revoked' | 'none'

export function sourceOf(
  roles: readonly Role[],
  privilege: Privilege,
  overrides: Overrides = {},
): Source {
  if ((overrides.revoked ?? []).includes(privilege)) return 'revoked'
  if ((overrides.granted ?? []).includes(privilege)) return 'granted'
  return fromPreset(roles, privilege) ? 'preset' : 'none'
}

export function fromPreset(roles: readonly Role[], privilege: Privilege): boolean {
  if (PRESETS[ROLE.member].includes(privilege)) return true
  return roles.some((role) => PRESETS[role].includes(privilege))
}
