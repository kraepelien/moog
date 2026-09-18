import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { Plugin, ViteDevServer } from 'vite'
import { join, relative, sep } from 'node:path'
import { createApi } from './api.ts'
import { openDatabase } from './db.ts'
import { loadFactory } from './factory.ts'
import { authConfigFromEnv } from './identity.ts'
import { describeAuth, dirAt, envTrouble } from './startup.ts'
import { seedTags } from './services/tags.ts'

/* The same API the standalone server serves, from inside `bun run dev`, so dev
   and production cannot answer differently. */

export interface PatchApiOptions {
  readonly root: string
  /* The bank shipped in the repo, reloaded into the database on every start. */
  readonly seed: string
}

/* The body is a stream rather than buffered because every request is offered to
   the handler: one it declines has to reach Vite with its body still unread. */
export function toRequest(req: IncomingMessage): Request {
  /* The real host: built against a constant, anything deciding from the origin
     — a cookie's Secure flag, a redirect back — reasons about a fiction. */
  const scheme = 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http'
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `${scheme}://${host}`)

  const method = (req.method ?? 'GET').toUpperCase()
  const canHaveBody = method !== 'GET' && method !== 'HEAD'

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    /* Node hands back an array for a header sent more than once. */
    if (typeof value === 'string') headers.append(key, value)
    else if (Array.isArray(value)) for (const one of value) headers.append(key, one)
  }

  /* `duplex` is missing from the typing rather than from the runtime. */
  const init: RequestInit = { method, headers }
  if (canHaveBody) {
    Object.assign(init, { body: Readable.toWeb(req), duplex: 'half' })
  }

  return new Request(url.toString(), init)
}

export async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status

  /* `Headers.forEach` yields Set-Cookie as one comma-joined string, which is
     valid for nothing. Signing in sets two at once. */
  for (const [key, value] of response.headers) {
    if (key.toLowerCase() !== 'set-cookie') res.setHeader(key, value)
  }
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) res.setHeader('set-cookie', cookies)

  res.end(Buffer.from(await response.arrayBuffer()))
}

/* Nothing under `server/` is ever reloaded. The API is built once, when the dev
   server starts, and Bun holds the module graph across Vite's own restart, so
   even `server.restart()` comes back with the routes it already had. Pulling a
   branch that adds one therefore leaves it 404ing against a process that
   predates it, and a route missing from a server the developer is looking at
   reads as a broken build rather than as a process wanting a restart.

   Vite says as much itself when a config dependency changes, which every file
   here is. But `--configLoader native` hands the config to Bun, so Vite never
   learns what it imported and says nothing. This is that message. */
export function watchServerSources(server: ViteDevServer): void {
  const sources = join(server.config.root, 'server') + sep
  /* Added explicitly: Vite watches what it has loaded, and it has loaded none
     of this. */
  server.watcher.add(sources)
  server.watcher.on('change', (file) => {
    if (!file.startsWith(sources)) return
    const name = relative(server.config.root, file)
    server.config.logger.warn(`  ➜  ${name} changed. Restart \`bun run dev\` to serve it.`)
  })
}

export function patchApi(options: PatchApiOptions): Plugin {
  return {
    name: 'moog-patch-api',
    async configureServer(server) {
      watchServerSources(server)

      const db = openDatabase(join(options.root, 'moog.db'))
      const reseed = process.env.MOOG_RESEED === '1'
      const factory = loadFactory(db, options.seed, { reseed })
      seedTags(db)
      server.config.logger.info(
        reseed
          ? `  ➜  Factory bank: ${factory.loaded} presets reseeded from ${options.seed}`
          : `  ➜  Factory bank: ${factory.loaded} new, ${factory.kept} kept`,
      )

      /* Without this, a .env the server cannot see looks exactly like no .env at
         all: sign-in is skipped, everything belongs to the local user, and the
         only symptom is a login screen that never appears. */
      const config = authConfigFromEnv(process.env)
      server.config.logger.info(`  ➜  Sign-in: ${describeAuth(config)}`)
      const trouble = envTrouble(dirAt(process.cwd()), process.env)
      if (trouble) server.config.logger.warn(`  ➜  ${trouble}`)

      const handle = createApi({ db, config })
      /* Every request, because the handler decides what is its own — filtering
         by prefix here is what made dev and production disagree. */
      server.middlewares.use((req, res, next) => {
        void (async () => {
          try {
            const response = await handle(toRequest(req))
            if (!response) return next()
            await send(res, response)
          } catch (error) {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: String(error) }))
          }
        })()
      })
    },
  }
}
