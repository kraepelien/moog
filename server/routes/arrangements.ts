import { PRIVILEGE } from '../../src/access/privileges.ts'
import { json, readBody } from '../http.ts'
import { isRefusal } from '../services/refusal.ts'
import { route, type Route } from './table.ts'

/* Every one of these needs StoreMidi, declared here rather than checked inside:
   keeping a MIDI file and the sounds put on it is the privilege, and there is
   no half of this resource that is open.

   Ownership is not among the checks. An arrangement belongs to exactly one
   person and the repository scopes every query to them, so there is no reading
   of somebody else's to refuse — a stranger's id is simply not found. */

export const arrangementRoutes: readonly Route[] = [
  route({
    method: 'GET',
    path: '/arrangements',
    needs: PRIVILEGE.StoreMidi,
    handle: ({ services, viewer }) =>
      json(services.repositories.arrangements.listOwnedBy(viewer.user.id)),
  }),

  route({
    method: 'POST',
    path: '/arrangements',
    needs: PRIVILEGE.StoreMidi,
    handle: async ({ request, services, viewer }) => {
      const saved = services.arrangements.create(await readBody(request), viewer)
      return isRefusal(saved) ? json({ error: saved.error }, saved.status) : json(saved, 201)
    },
  }),

  route({
    method: 'GET',
    path: '/arrangements/:id',
    needs: PRIVILEGE.StoreMidi,
    handle: ({ params, services, viewer }) => {
      const found = services.arrangements.get(params.id!, viewer)
      return isRefusal(found) ? json({ error: found.error }, found.status) : json(found)
    },
  }),

  /* Saving again over the one you opened, rather than a second copy of it
     piling up beside the first — the same rule the patch editor follows. */
  route({
    method: 'PUT',
    path: '/arrangements/:id',
    needs: PRIVILEGE.StoreMidi,
    handle: async ({ params, request, services, viewer }) => {
      const saved = services.arrangements.replace(params.id!, await readBody(request), viewer)
      return isRefusal(saved) ? json({ error: saved.error }, saved.status) : json(saved)
    },
  }),

  route({
    method: 'DELETE',
    path: '/arrangements/:id',
    needs: PRIVILEGE.StoreMidi,
    handle: ({ params, services, viewer }) => {
      const removed = services.arrangements.remove(params.id!, viewer)
      return isRefusal(removed)
        ? json({ error: removed.error }, removed.status)
        : json({ deleted: params.id })
    },
  }),
]
