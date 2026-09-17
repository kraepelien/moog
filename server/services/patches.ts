import { PRIVILEGE } from '../../src/access/privileges.ts'
import { migrateToCurrent } from '../../src/patch/migrate.ts'
import { createPatch, type Patch } from '../../src/patch/schema.ts'
import type { Limits } from '../limits.ts'
import type { Located } from '../repositories/patches.ts'
import type { Repositories } from '../repositories/index.ts'
import type { Viewer } from './access.ts'
import type { Refusal } from './refusal.ts'

/* Who may do what to a patch.
 *
 * Factory content is never writable, by anyone, including an admin: it comes
 * from the image and a change would be overwritten at the next start. Someone
 * else's private patch answers 404 rather than 403, because a 403 confirms the
 * id exists. */

export interface Identity {
  readonly newId: () => string
  readonly now: () => string
}

const isFactory = (found: Located) => found.slug !== null
const isMine = (found: Located, viewer: Viewer) => found.ownerId === viewer.user.id

export function createPatchService(
  repositories: Repositories,
  limits: Limits,
  identity: Identity,
) {
  const { patches } = repositories

  const service = {
    mayRead(found: Located, viewer: Viewer): boolean {
      return isFactory(found) || isMine(found, viewer) || found.visibility === 'public'
    },

    mayWrite(found: Located, viewer: Viewer): Refusal | null {
      if (isFactory(found)) return { error: 'factory presets are read-only', status: 403 }
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
       preset and pressing Save arrives here, which is what makes "you can never
       save over one" a missing route rather than a rule to remember. */
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
