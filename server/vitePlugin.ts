import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { Plugin } from 'vite'
import { join } from 'node:path'
import { createApi } from './api.ts'
import { openDatabase } from './db.ts'
import { loadFactory } from './factory.ts'
import { authConfigFromEnv } from './identity.ts'
import { describeAuth, dirAt, envTrouble } from './startup.ts'
import { seedTags } from './tags.ts'

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

export function patchApi(options: PatchApiOptions): Plugin {
  return {
    name: 'moog-patch-api',
    async configureServer(server) {
      const db = openDatabase(join(options.root, 'moog.db'))
      const factory = loadFactory(db, options.seed)
      seedTags(db)
      server.config.logger.info(`  ➜  Factory bank: ${factory.loaded} presets`)

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
