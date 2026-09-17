/* What a person is allowed to do, named once for both sides. The server decides
   and the client only draws: a hidden button is a courtesy, never the check.

   Two vocabularies, deliberately unlike each other:

   A **privilege** is a thing the code can do, and exists only in code. Nothing
   stores one, so adding a privilege is this file plus the route that asks for
   it — never a migration, and never a row somewhere to be kept in step.

   A **role** is stored against a user, which makes its name a published
   interface in the same way a control id is: renaming one leaves every row
   naming something nobody grants. Add roles; do not rename them. */

export const PRIVILEGE = {
  /* The administration area at all. Holding it opens the door; what is behind
     each panel in there is its own privilege, so a later tag curator does not
     also get the user list. */
  AccessAdmin: 'AccessAdmin',
  AdminTags: 'AdminTags',
  /* Editing, deleting and unpublishing a patch that belongs to somebody else.
     Factory content is still refused to everybody holding it: the bank comes
     from the image and a write would be overwritten at the next start. */
  AdminPatches: 'AdminPatches',
  /* Saving a MIDI file against a channel with the patches it plays through,
     rather than only playing one that was dropped in. */
  StoreMidi: 'StoreMidi',
} as const

export type Privilege = (typeof PRIVILEGE)[keyof typeof PRIVILEGE]

export const PRIVILEGES: readonly Privilege[] = Object.values(PRIVILEGE)

export const ROLE = {
  admin: 'admin',
  member: 'member',
} as const

export type Role = (typeof ROLE)[keyof typeof ROLE]

export const ROLES: readonly Role[] = Object.values(ROLE)

/* Every signed-in person is a member, so `member` is what an ordinary account
   can do rather than an empty row. An admin is granted the member set outright
   instead of inheriting it: one table to read when asking why somebody can do
   something. */
const GRANTS: Record<Role, readonly Privilege[]> = {
  member: [PRIVILEGE.StoreMidi],
  admin: [
    PRIVILEGE.AccessAdmin,
    PRIVILEGE.AdminTags,
    PRIVILEGE.AdminPatches,
    PRIVILEGE.StoreMidi,
  ],
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export function isPrivilege(value: unknown): value is Privilege {
  return typeof value === 'string' && (PRIVILEGES as readonly string[]).includes(value)
}

/* One text column rather than a join table: the set is small and read on every
   request, and a role nobody grants any more should stop meaning anything by
   leaving GRANTS rather than by a delete that has to find every row. An unknown
   name is dropped, so a column written by a newer build does not stop an older
   one answering. */
export function parseRoles(stored: string | null | undefined): Role[] {
  if (!stored) return []
  const held = new Set<Role>()
  for (const part of stored.split(',')) {
    const name = part.trim()
    if (isRole(name)) held.add(name)
  }
  return [...held]
}

export function formatRoles(roles: readonly Role[]): string {
  return [...new Set(roles)].join(',')
}

export function privilegesOf(roles: readonly Role[]): Privilege[] {
  const held = new Set<Privilege>()
  for (const role of roles) for (const privilege of GRANTS[role]) held.add(privilege)
  return [...held]
}

export function grants(roles: readonly Role[], privilege: Privilege): boolean {
  return roles.some((role) => (GRANTS[role] as readonly Privilege[]).includes(privilege))
}
