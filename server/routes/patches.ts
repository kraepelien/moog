import { isRating } from '../../src/components/library/entry.ts'
import { badRequest, json, readBody } from '../http.ts'
import { isSafeName } from '../repositories/patches.ts'
import { isRefusal, type Refusal } from '../services/refusal.ts'
import { route, type Route, type RouteContext } from './table.ts'

/* Reading a patch is open to any signed-in viewer and refused per patch by the
   service, because whether you may see one depends on the row rather than on
   anything the table could declare. Writing somebody else's is the privilege,
   and the service asks for it. */

const refuse = (refusal: Refusal) => json({ error: refusal.error }, refusal.status)

/* Every route below names a patch, so the id check happens once here rather
   than as the first line of six handlers. */
function locate(context: RouteContext, options: { deleted?: boolean } = {}) {
  const id = context.params.id!
  if (!isSafeName(id)) return badRequest('invalid id')
  return context.services.patches.find(id, context.viewer, options)
}

export const patchRoutes: readonly Route[] = [
  route({
    method: 'GET',
    path: '/patches',
    handle: ({ viewer, services }) =>
      json(services.repositories.patches.listOwnedBy(viewer.user.id)),
  }),

  route({
    method: 'POST',
    path: '/patches',
    handle: async ({ request, viewer, services }) => {
      const created = services.patches.create(await readBody(request), viewer)
      return isRefusal(created) ? refuse(created) : json(created, 201)
    },
  }),

  route({
    method: 'GET',
    path: '/patches/:id',
    handle: (context) => {
      const found = locate(context)
      if (found instanceof Response) return found
      if (isRefusal(found)) return refuse(found)
      return json(context.services.repositories.patches.get(found.uid))
    },
  }),

  route({
    method: 'PUT',
    path: '/patches/:id',
    handle: async (context) => {
      const found = locate(context)
      if (found instanceof Response) return found
      if (isRefusal(found)) return refuse(found)

      const refusal = context.services.patches.mayWrite(found, context.viewer)
      if (refusal) return refuse(refusal)

      const saved = context.services.patches.replace(
        found,
        await readBody(context.request),
        context.viewer,
      )
      return isRefusal(saved) ? refuse(saved) : json(saved)
    },
  }),

  route({
    method: 'DELETE',
    path: '/patches/:id',
    handle: (context) => {
      const found = locate(context)
      if (found instanceof Response) return found
      if (isRefusal(found)) return refuse(found)

      const refusal = context.services.patches.mayWrite(found, context.viewer)
      if (refusal) return refuse(refusal)

      context.services.repositories.patches.delete(found.uid)
      return json({ deleted: context.params.id })
    },
  }),

  route({
    method: 'PUT',
    path: '/patches/:id/rating',
    handle: async (context) => {
      const found = locate(context)
      if (found instanceof Response) return found
      if (isRefusal(found)) return refuse(found)

      const payload = (await readBody(context.request)) as { stars?: unknown } | null
      const stars = payload?.stars
      if (!isRating(stars)) return badRequest('stars must be 0 to 5 in steps of a half')

      context.services.repositories.ratings.set(context.viewer.user.id, found.uid, stars)
      return json({ id: context.params.id, stars })
    },
  }),

  /* Unpublishing is its own route rather than a PUT of the whole patch: an
     admin taking something out of everyone's library should not have to send
     back a body they never read. */
  route({
    method: 'POST',
    path: '/patches/:id/unpublish',
    handle: (context) => {
      const found = locate(context)
      if (found instanceof Response) return found
      if (isRefusal(found)) return refuse(found)

      const refusal = context.services.patches.mayWrite(found, context.viewer)
      if (refusal) return refuse(refusal)

      context.services.repositories.patches.setVisibility(found.uid, 'private')
      return json(context.services.repositories.patches.get(found.uid))
    },
  }),

  route({
    method: 'POST',
    path: '/patches/:id/restore',
    handle: (context) => {
      const found = locate(context, { deleted: true })
      if (found instanceof Response) return found
      if (isRefusal(found)) return refuse(found)

      const refusal = context.services.patches.mayWrite(found, context.viewer)
      if (refusal) return refuse(refusal)

      context.services.repositories.patches.restore(found.uid)
      return json(context.services.repositories.patches.get(found.uid))
    },
  }),
]
