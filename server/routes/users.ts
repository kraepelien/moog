import { PRIVILEGE } from '@access/privileges.ts'
import { badRequest, json, readBody } from '@server/http.ts'
import { isRefusal } from '@server/services/refusal.ts'
import { route, type Route } from './table.ts'

/* Everyone with an account, and what they may do.
 *
 * All of it needs AdminUsers — there is no half of this open to anybody else.
 * A privilege is written one at a time rather than as a set, so a row naming a
 * privilege this build does not know is left exactly as it is: a whole-set
 * write would delete it, and an orphaned revoke silently deleted is somebody
 * getting access back. */

const answer = (result: unknown) =>
  isRefusal(result) ? json({ error: result.error }, result.status) : json(result)

export const userRoutes: readonly Route[] = [
  route({
    method: 'GET',
    path: '/users',
    needs: PRIVILEGE.AdminUsers,
    handle: ({ services }) => json(services.users.list()),
  }),

  route({
    method: 'GET',
    path: '/users/:uid',
    needs: PRIVILEGE.AdminUsers,
    handle: ({ params, services }) => answer(services.users.get(params.uid!)),
  }),

  route({
    method: 'PUT',
    path: '/users/:uid/roles',
    needs: PRIVILEGE.AdminUsers,
    handle: async ({ params, request, services }) => {
      const payload = (await readBody(request)) as { roles?: unknown } | null
      return answer(services.users.setRoles(params.uid!, payload?.roles))
    },
  }),

  route({
    method: 'PUT',
    path: '/users/:uid/privileges/:privilege',
    needs: PRIVILEGE.AdminUsers,
    handle: async ({ params, request, services, viewer }) => {
      const payload = (await readBody(request)) as { granted?: unknown } | null
      if (typeof payload?.granted !== 'boolean') {
        return badRequest('granted must be true or false')
      }
      return answer(
        services.users.setOverride(params.uid!, params.privilege!, payload.granted, viewer),
      )
    },
  }),

  /* Back to whatever the roles say, which is the absence of a row rather than a
     third stored state. */
  route({
    method: 'DELETE',
    path: '/users/:uid/privileges/:privilege',
    needs: PRIVILEGE.AdminUsers,
    handle: ({ params, services, viewer }) =>
      answer(services.users.setOverride(params.uid!, params.privilege!, null, viewer)),
  }),
]
