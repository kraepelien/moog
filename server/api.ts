import type { Database } from 'bun:sqlite'
import { authConfigFromEnv, type AuthConfig } from './identity.ts'
import { fromElsewhere, json } from './http.ts'
import { callerKey, createRateLimiter, limitsFromEnv, type Limits } from './limits.ts'
import { createRepositories } from './repositories/index.ts'
import { handleAuth } from './routes/auth.ts'
import { allRoutes } from './routes/index.ts'
import { dispatch } from './routes/table.ts'
import { createOpsLog, type OpsLog } from './ops.ts'
import { createServices } from './services/index.ts'
import type { Identity } from './services/patches.ts'

/* One request handler, shared by the Vite dev plugin and the standalone server,
   so development and production cannot drift into answering differently.

   Wiring only. What each route needs is declared in the table, the rules live
   in the services and the SQL lives in the repositories; this file decides the
   order the three things in front of every route happen in — where the request
   came from, who is asking, and how often they have asked. */

export interface ApiOptions {
  readonly db: Database
  readonly config?: AuthConfig
  readonly limits?: Limits
  /* Injected so the token exchange can be driven without a network. */
  readonly doFetch?: typeof fetch
  readonly now?: () => number
  readonly identity?: Identity
  /* What the housekeeping has done. Supplied by whoever runs it, so the dev
     plugin's default is an empty record that says nothing is scheduled rather
     than zeroes that would read as a backup which failed. */
  readonly ops?: OpsLog
}

export function createApi({
  db,
  config = authConfigFromEnv(process.env),
  limits = limitsFromEnv(process.env),
  doFetch,
  now,
  identity,
  ops = createOpsLog({ now }),
}: ApiOptions): (request: Request) => Promise<Response | null> {
  const repositories = createRepositories(db)
  if (config.mode === 'off') repositories.users.ensureLocal(config.localUser)

  const services = createServices({ repositories, config, limits, identity, ops })

  const writes = createRateLimiter(limits.writesPerMinute, now)
  const signIns = createRateLimiter(limits.signInsPerMinute, now)

  /* Returns null for anything that is not ours, so the caller can fall through
     to serving the app rather than 404ing every page load. */
  return async function handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return null

    const segments = url.pathname.slice('/api/'.length).split('/').filter(Boolean)
    const method = request.method.toUpperCase()
    const writing = method !== 'GET' && method !== 'HEAD'

    if (writing && fromElsewhere(request, config)) {
      return json({ error: 'cross-site request' }, 403)
    }

    try {
      /* Inside the try: reading the session touches the database, and a failure
         there is a storage failure like any other rather than a crash. */

      /* Before the session is read, because signing in is what somebody without
         one does. */
      if (segments[0] === 'auth') {
        const [, provider, action] = segments
        if (action === 'start' && !signIns.allow(callerKey(request, null))) {
          return json({ error: 'too many sign-in attempts, wait a minute' }, 429)
        }
        return handleAuth(
          request,
          {
            db,
            config,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            doFetch,
            now,
          },
          { provider, action },
        )
      }

      const viewer = await services.access.viewerFor(request)

      /* Ahead of every route that writes, so none of them can be reached
         without passing it. Counted per person once there is one, and per
         address before that, so one runaway client cannot spend everybody's
         allowance. */
      if (writing && !writes.allow(callerKey(request, viewer?.user.uid ?? null))) {
        return json({ error: 'too many writes, wait a minute' }, 429)
      }

      return await dispatch({ routes: allRoutes, services }, request, url, segments, viewer)
    } catch (error) {
      /* The browser adapter turns this into a StoreError, so a disk problem
         reaches the UI as a storage failure rather than as a parse error. */
      return json({ error: error instanceof Error ? error.message : 'storage failed' }, 500)
    }
  }
}
