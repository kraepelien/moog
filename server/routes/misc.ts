import { badRequest, json, readBody } from '@server/http.ts'
import { route, type Route } from './table.ts'

/* The routes with no rules of their own: each one reads its repository and
   answers. They live together rather than in a file each, because a file
   holding one four-line handler is a worse map of the server than this. */

export const miscRoutes: readonly Route[] = [
  /* Unauthenticated on purpose: the container's healthcheck calls it, and it
     asks the database a real question so an unmounted volume fails. */
  route({
    method: 'GET',
    path: '/health',
    open: true,
    handle: ({ services }) => json({ ok: true, patches: services.repositories.patches.count() }),
  }),

  /* Always 200, never 401: it is how the app finds out whether it is signed in,
     so refusing it would leave nothing to ask. The privileges travel with it
     because every guard the client draws is downstream of this one call. */
  route({
    method: 'GET',
    path: '/session',
    open: true,
    handle: ({ services, viewer }) =>
      json({
        mode: services.config.mode,
        signedIn: viewer !== null,
        roles: viewer?.roles ?? [],
        privileges: viewer?.privileges ?? [],
        user:
          viewer === null
            ? null
            : {
                uid: viewer.user.uid,
                name: viewer.user.display_name,
                avatar: viewer.user.avatar_url,
              },
      }),
  }),

  route({
    method: 'GET',
    path: '/settings',
    handle: ({ services, viewer }) => json(services.repositories.settings.of(viewer.user.id)),
  }),

  route({
    method: 'PUT',
    path: '/settings',
    handle: async ({ request, services, viewer }) => {
      const payload = await readBody(request)
      if (payload === null || typeof payload !== 'object') return badRequest('invalid body')
      services.repositories.settings.put(viewer.user.id, payload)
      return json(payload)
    },
  }),

  route({
    method: 'GET',
    path: '/library',
    handle: ({ url, services, viewer }) =>
      json(
        services.repositories.library.entriesFor(
          viewer.user.id,
          url.searchParams.get('instrument'),
        ),
      ),
  }),
]
