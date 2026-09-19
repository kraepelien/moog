import { PRIVILEGE } from '@access/privileges.ts'
import { migrateToCurrent } from '@patch/migrate.ts'
import type { PatchRecord } from '@patch/record.ts'
import { createPatch, type Patch } from '@patch/schema.ts'
import type { Limits } from '@server/limits.ts'
import type { Located } from '@server/repositories/patches.ts'
import type { Repositories } from '@server/repositories/index.ts'
import type { Viewer } from './access.ts'
import type { Refusal } from './refusal.ts'

/* Who may do what to a patch.
 *
 * Factory content is never writable, by anyone, including an admin: it comes
 * from the image and a change would be overwritten at the next start. Someone
 * else's private patch answers 404 rather than 403 for everybody without
 * `AdminPatches`, because a 403 confirms the id exists. */

export interface Identity {
  readonly newId: () => string
  readonly now: () => string
}

const DAY_MS = 24 * 60 * 60 * 1000

const isFactory = (found: Located) => found.slug !== null
const isMine = (found: Located, viewer: Viewer) => found.ownerId === viewer.user.id

export function createPatchService(
  repositories: Repositories,
  limits: Limits,
  identity: Identity,
) {
  const { patches } = repositories

  const stamped = (row: Omit<PatchRecord, 'purgeAt'>): PatchRecord => ({
    ...row,
    purgeAt:
      row.deletedAt === null
        ? null
        : new Date(Date.parse(row.deletedAt) + limits.trashDays * DAY_MS).toISOString(),
  })

  const service = {
    /* `AdminPatches` reads as well as writes. It always meant to: `mayWrite`
       admits it and `find` runs this first, so without it an administrator
       could edit somebody's *public* patch through the API while a private one
       404'd before the write rule was ever consulted. The list that privilege
       now draws would otherwise show private rows that refuse to open.

       It follows that an admin can copy a private patch as well, since
       `create({ from })` reads through here. That is consistent with their
       already being able to edit it, and it has a test of its own so it is a
       decision rather than a leak. */
    mayRead(found: Located, viewer: Viewer): boolean {
      if (isFactory(found) || isMine(found, viewer) || found.visibility === 'public') return true
      return viewer.can(PRIVILEGE.AdminPatches)
    },

    /* Every patch on the install, with the moment the sweep will take a deleted
       one. `trashDays` is a rule and lives here rather than in the SQL. */
    listEverything(): PatchRecord[] {
      return patches.listAll().map(stamped)
    },

    /* Everybody has a trash, and it is their own: the scope is the rule, the
       same way `GET /patches` is scoped to whoever asked. */
    listTrash(viewer: Viewer): PatchRecord[] {
      return patches.listDeletedOwnedBy(viewer.user.id).map(stamped)
    },

    /* Two questions, because the bank answers them differently.

       Changing what a factory patch *says* is a correction, and it is what
       seeding the bank rather than syncing it was for: the rows are the live
       bank, so a correction has somewhere to live that a restart will not undo,
       and an administrator making one is the only thing that changes a factory
       patch. The whole bank was wrong once, which is what `BANK_REFRESH`
       exists to remember, and until now nothing could fix a single sheet of it.

       Taking one out of circulation is a different act: retiring a page of the
       manual rather than fixing a knob drawn on it. Nothing offers it. */
    mayEdit(found: Located, viewer: Viewer): Refusal | null {
      if (viewer.can(PRIVILEGE.AdminPatches)) return null
      if (isFactory(found)) return { error: 'factory patches are read-only', status: 403 }
      if (isMine(found, viewer)) return null
      return { error: 'not yours', status: 403 }
    },

    /* Deleting, unpublishing and restoring: whether the patch is there at all,
       and who can see it. The bank is refused to everybody, administrators
       included, because a retired factory patch stays retired and no file will
       bring it back. */
    mayRemove(found: Located, viewer: Viewer): Refusal | null {
      if (isFactory(found)) return { error: 'factory patches are read-only', status: 403 }
      if (isMine(found, viewer) || viewer.can(PRIVILEGE.AdminPatches)) return null
      return { error: 'not yours', status: 403 }
    },

    /* Values are the only part of a patch that has no natural size, and a patch
       of the whole panel is well under a kilobyte. */
    overSized(patch: Patch): string | null {
      const bytes = JSON.stringify(patch.values).length
      return bytes > limits.maxPatchBytes
        ? `That patch carries ${bytes} bytes of control values, and the limit is ${limits.maxPatchBytes}.`
        : null
    },

    /* The patch the viewer named, or the reason they may not have it. Deleted
       rows are gone unless the caller is the one restoring them. */
    find(id: string, viewer: Viewer, options: { deleted?: boolean } = {}): Located | Refusal {
      const found = patches.locate(id)
      if (!found) return { error: 'not found', status: 404 }
      if (found.deletedAt !== null && options.deleted !== true) {
        return { error: 'not found', status: 404 }
      }
      if (!service.mayRead(found, viewer)) return { error: 'not found', status: 404 }
      return found
    },

    /* Save as, and the only way a patch comes into existence. Loading a factory
       patch and pressing Save arrives here, which is what makes "you can never
       save over one" a refusal in `mayEdit` rather than a rule to remember,
       for everybody who is not correcting the bank on purpose. */
    create(payload: unknown, viewer: Viewer): Patch | Refusal {
      if (patches.countOwnedBy(viewer.user.id) >= limits.maxPatches) {
        return {
          error: `You have ${limits.maxPatches} patches, which is as many as this install keeps.`,
          status: 413,
        }
      }

      const given = payload as { from?: unknown; schemaVersion?: number } | null
      const parsed = migrateToCurrent({
        ...(given as object),
        /* A body on its way to being created has no id or timestamps yet, so it
           is given plausible ones to validate against and the real ones below. */
        id: 'pending',
        schemaVersion: given?.schemaVersion ?? 1,
        createdAt: identity.now(),
        updatedAt: identity.now(),
      })
      if (!parsed.ok) return { error: parsed.error, status: 400 }

      const tooBig = service.overSized(parsed.value)
      if (tooBig) return { error: tooBig, status: 413 }

      const source = typeof given?.from === 'string' ? patches.locate(given.from) : null
      if (given?.from !== undefined && (!source || !service.mayRead(source, viewer))) {
        return { error: 'not found', status: 404 }
      }

      const stamped = createPatch(
        {
          name: parsed.value.name,
          notes: parsed.value.notes,
          values: parsed.value.values,
          tags: parsed.value.tags,
          instrument: parsed.value.instrument,
          visibility: parsed.value.visibility,
          derivedFrom: source
            ? {
                id: source.slug ?? source.uid,
                name: source.name,
                kind: source.slug === null ? 'user' : 'factory',
                ownerId: source.ownerUid,
                ownerName: source.ownerName,
                at: identity.now(),
              }
            : null,
        },
        identity,
      )

      return patches.create(stamped, viewer.user.id, stamped.id)
    },

    /* The id and the owner are the route's, not the body's: a PUT edits the
       patch it names and cannot hand it to somebody else. */
    replace(found: Located, payload: unknown, viewer: Viewer): Patch | Refusal {
      const parsed = migrateToCurrent(payload)
      if (!parsed.ok) return { error: parsed.error, status: 400 }

      const tooBig = service.overSized(parsed.value)
      if (tooBig) return { error: tooBig, status: 413 }

      patches.put(
        found.uid,
        { ...parsed.value, id: found.uid },
        found.ownerId ?? viewer.user.id,
      )
      return patches.get(found.uid)!
    },
  }

  return service
}

export type PatchService = ReturnType<typeof createPatchService>
