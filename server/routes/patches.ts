import { migrateToCurrent } from '../../src/patch/migrate.ts'
import { createPatch, type Patch } from '../../src/patch/schema.ts'
import type { Limits } from '../limits.ts'
import { isSafeName, type Located, type Store } from '../store.ts'
import type { UserRow } from '../users.ts'

/* Who may do what to a patch.
 *
 * Factory content is never writable, by anyone, including an admin: it comes
 * from the image and a change would be overwritten at the next start. Someone
 * else's private patch answers 404 rather than 403, because a 403 confirms the
 * id exists. */

export interface RouteContext {
  readonly store: Store
  readonly viewer: UserRow | null
  readonly admin: boolean
  readonly limits: Limits
  readonly json: (body: unknown, status?: number) => Response
  readonly body: (request: Request) => Promise<unknown>
  readonly newId: () => string
  readonly now: () => string
}

const isFactory = (found: Located) => found.slug !== null
const isMine = (found: Located, viewer: UserRow) => found.ownerId === viewer.id

function mayRead(found: Located, viewer: UserRow): boolean {
  return isFactory(found) || isMine(found, viewer) || found.visibility === 'public'
}

export async function handlePatches(
  request: Request,
  context: RouteContext,
  parts: { name?: string; sub?: string },
): Promise<Response> {
  const { store, viewer, admin, json, body } = context
  const method = request.method.toUpperCase()

  if (!viewer) return json({ error: 'sign in' }, 401)

  if (!parts.name) {
    if (method === 'GET') return json(store.listPatches(viewer.id))
    if (method === 'POST') return create(request, context)
    return json({ error: 'method not allowed' }, 405)
  }

  if (!isSafeName(parts.name)) return json({ error: 'invalid id' }, 400)

  const found = store.locate(parts.name)
  if (!found || (found.deletedAt !== null && parts.sub !== 'restore')) {
    return json({ error: 'not found' }, 404)
  }
  if (!mayRead(found, viewer)) return json({ error: 'not found' }, 404)

  if (parts.sub === 'rating') {
    if (method !== 'PUT') return json({ error: 'method not allowed' }, 405)
    const payload = (await body(request)) as { stars?: unknown } | null
    const stars = payload?.stars
    if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 0 || stars > 5) {
      return json({ error: 'stars must be a whole number from 0 to 5' }, 400)
    }
    store.setRating(viewer.id, found.uid, stars)
    return json({ id: parts.name, stars })
  }

  /* Unpublishing is its own route rather than a PUT of the whole patch: an
     admin taking something out of everyone's library should not have to send
     back a body they never read. */
  if (parts.sub === 'unpublish') {
    if (method !== 'POST') return json({ error: 'method not allowed' }, 405)
    const refusal = mayWrite(found, viewer, admin)
    if (refusal) return json({ error: refusal.error }, refusal.status)
    store.setVisibility(found.uid, 'private')
    return json(store.getPatch(found.uid))
  }

  if (parts.sub === 'restore') {
    if (method !== 'POST') return json({ error: 'method not allowed' }, 405)
    const refusal = mayWrite(found, viewer, admin)
    if (refusal) return json({ error: refusal.error }, refusal.status)
    store.restorePatch(found.uid)
    return json(store.getPatch(found.uid))
  }

  if (parts.sub) return json({ error: 'not found' }, 404)

  if (method === 'GET') return json(store.getPatch(found.uid))

  if (method === 'PUT' || method === 'DELETE') {
    const refusal = mayWrite(found, viewer, admin)
    if (refusal) return json({ error: refusal.error }, refusal.status)

    if (method === 'DELETE') {
      store.deletePatch(found.uid)
      return json({ deleted: parts.name })
    }

    const parsed = migrateToCurrent(await body(request))
    if (!parsed.ok) return json({ error: parsed.error }, 400)

    const tooBig = overSized(parsed.value, context.limits)
    if (tooBig) return json({ error: tooBig }, 413)

    /* The id and the owner are the route's, not the body's: a PUT edits the
       patch it names and cannot hand it to somebody else. */
    store.putPatch(found.uid, { ...parsed.value, id: found.uid }, found.ownerId ?? viewer.id)
    return json(store.getPatch(found.uid))
  }

  return json({ error: 'method not allowed' }, 405)
}

/* Values are the only part of a patch that has no natural size, and a patch
   of the whole panel is well under a kilobyte. */
function overSized(patch: Patch, limits: Limits): string | null {
  const bytes = JSON.stringify(patch.values).length
  return bytes > limits.maxPatchBytes
    ? `That patch carries ${bytes} bytes of control values, and the limit is ${limits.maxPatchBytes}.`
    : null
}

function mayWrite(
  found: Located,
  viewer: UserRow,
  admin: boolean,
): { error: string; status: number } | null {
  if (isFactory(found)) return { error: 'factory presets are read-only', status: 403 }
  if (isMine(found, viewer) || admin) return null
  return { error: 'not yours', status: 403 }
}

/* Save as, and the only way a patch comes into existence. Loading a factory
   preset and pressing Save arrives here, which is what makes "you can never
   save over one" a missing route rather than a rule to remember. */
async function create(request: Request, context: RouteContext): Promise<Response> {
  const { store, viewer, json, body, newId, now, limits } = context
  if (!viewer) return json({ error: 'sign in' }, 401)

  if (store.countOwnedBy(viewer.id) >= limits.maxPatches) {
    return json(
      { error: `You have ${limits.maxPatches} patches, which is as many as this install keeps.` },
      413,
    )
  }

  const payload = (await body(request)) as { from?: unknown } | null
  const parsed = migrateToCurrent({
    ...(payload as object),
    /* A body on its way to being created has no id or timestamps yet, so it is
       given plausible ones to validate against and the real ones below. */
    id: 'pending',
    schemaVersion: (payload as { schemaVersion?: number })?.schemaVersion ?? 1,
    createdAt: now(),
    updatedAt: now(),
  })
  if (!parsed.ok) return json({ error: parsed.error }, 400)

  const tooBig = overSized(parsed.value, limits)
  if (tooBig) return json({ error: tooBig }, 413)

  const source = typeof payload?.from === 'string' ? store.locate(payload.from) : null
  if (payload?.from !== undefined && (!source || !mayRead(source, viewer))) {
    return json({ error: 'not found' }, 404)
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
            at: now(),
          }
        : null,
    },
    { newId, now },
  )

  const stored: Patch = store.createPatch(stamped, viewer.id, stamped.id)
  return context.json(stored, 201)
}
