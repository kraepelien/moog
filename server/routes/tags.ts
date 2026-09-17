import { PRIVILEGE } from '@access/privileges.ts'
import { json, readBody } from '@server/http.ts'
import { isRefusal } from '@server/services/refusal.ts'
import { route, type Route } from './table.ts'

/* Readable by anyone, because the save form needs the list before it knows who
   is looking. Editing it, and the counts that go with it, is the privilege: the
   counts are over everybody's patches, private ones included.

   The counts are their own path rather than `/tags?use=1`, so that what they
   need is declared in the table with them. A query parameter deciding the
   privilege would put the check back inside the handler. */

export const tagRoutes: readonly Route[] = [
  route({
    method: 'GET',
    path: '/tags',
    open: true,
    handle: ({ services }) => json(services.tags.list()),
  }),

  route({
    method: 'GET',
    path: '/tags/in-use',
    needs: PRIVILEGE.AdminTags,
    handle: ({ services }) => json(services.tags.listInUse()),
  }),

  route({
    method: 'POST',
    path: '/tags',
    needs: PRIVILEGE.AdminTags,
    handle: async ({ request, services }) => {
      const payload = (await readBody(request)) as { name?: unknown } | null
      const added = services.tags.add(payload?.name)
      return isRefusal(added) ? json({ error: added.error }, added.status) : json(added, 201)
    },
  }),

  /* The colour only. A rename would change what every patch wearing the tag is
     pointing at — they store the name — so there is nothing else here to set. */
  route({
    method: 'PUT',
    path: '/tags/:id/colour',
    needs: PRIVILEGE.AdminTags,
    handle: async ({ params, request, services }) => {
      const payload = (await readBody(request)) as { colour?: unknown } | null
      const changed = services.tags.setColour(Number(params.id), payload?.colour ?? null)
      return isRefusal(changed) ? json({ error: changed.error }, changed.status) : json(changed)
    },
  }),

  route({
    method: 'DELETE',
    path: '/tags/:id',
    needs: PRIVILEGE.AdminTags,
    handle: ({ params, services }) => {
      const removed = services.tags.remove(Number(params.id))
      return isRefusal(removed)
        ? json({ error: removed.error }, removed.status)
        : json({ removed: Number(params.id) })
    },
  }),
]
