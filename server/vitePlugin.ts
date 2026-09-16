import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { createApi } from './api.ts'
import { layoutFor } from './store.ts'
import { seedPresets } from './seed.ts'

/* Serves the same API the standalone server does, from inside `bun run dev`, so
   there is no second process to start while working and no chance of dev and
   production answering differently. */

export interface PatchApiOptions {
  /* Where the app's files live. */
  readonly root: string
  /* The bank shipped in the repo, copied into root/presets the first time. */
  readonly seed: string
}

/* Vite's dev server speaks Node's request and response objects; the handler
   speaks Fetch. The body is buffered rather than streamed because these are
   small JSON documents and a stream would need duplex negotiation to no gain. */
async function toRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const method = (req.method ?? 'GET').toUpperCase()
  const canHaveBody = method !== 'GET' && method !== 'HEAD'

  /* Read as text rather than bytes: every request here carries JSON, and a
     string is unambiguously a valid body without reaching for DOM typings the
     server tsconfig does not load. */
  let body: string | undefined
  if (canHaveBody) {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    body = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : undefined
  }

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
  }

  return new Request(url.toString(), { method, headers, body })
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(Buffer.from(await response.arrayBuffer()))
}

export function patchApi(options: PatchApiOptions): Plugin {
  return {
    name: 'moog-patch-api',
    async configureServer(server) {
      const seeded = await seedPresets(options.seed, layoutFor(options.root).presets)
      if (seeded.reason === 'seeded') {
        server.config.logger.info(`  ➜  Seeded ${seeded.seeded} presets into ${options.root}/presets`)
      }

      const handle = createApi({ root: options.root })
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        void (async () => {
          try {
            const response = await handle(await toRequest(req))
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
