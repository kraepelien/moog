import { join, resolve } from 'node:path'
import { createApi } from './api.ts'
import { openDatabase } from './db.ts'
import { loadFactory } from './factory.ts'
import { limitsFromEnv } from './limits.ts'
import { createOpsLog, scheduleMaintenance } from './ops.ts'
import { createPatches } from './repositories/patches.ts'
import { authConfigFromEnv } from './identity.ts'
import { describeAuth, dirAt, envTrouble } from './startup.ts'
import { seedTags } from './services/tags.ts'

/* Serves the built app plus the same API the dev plugin serves, for running the
   editor without a toolchain. `bun run serve` after `bun run build`. */

/* New files are written group-writable rather than the default 644. The data
   folder belongs to a group holding both this process and the person who logs
   in, and the point of keeping patches as files is that they can be edited by
   hand — which a group-readable-only file does not allow. */
process.umask(0o002)

const root = process.env.PM_DATA ?? 'data'
const seed = process.env.PM_BANK ?? 'bank'
const dist = process.env.PM_DIST ?? 'dist'
const port = Number(process.env.PORT ?? 5174)

const databasePath = join(root, 'patchmemory.db')
const db = openDatabase(databasePath)
const ops = createOpsLog({ databasePath })
const factory = loadFactory(db, seed)
ops.recordFactory(factory)
seedTags(db)
console.log(
  factory.refreshed
    ? `Factory bank: ${factory.loaded} patches refreshed from ${seed}, the one-off, and there is no second one`
    : `Factory bank: ${factory.loaded} new, ${factory.kept} kept, ${factory.retired} retired`,
)
console.log(`Sign-in: ${describeAuth(authConfigFromEnv(process.env))}`)
const envTroubleFound = envTrouble(dirAt(process.cwd()), process.env)
if (envTroubleFound) console.warn(envTroubleFound)

/* Trash is a grace period rather than a place things stay, and the database is
   copied daily because a plain file copy of one in WAL mode can catch it
   mid-write. Both live in `ops.ts` now, with the record of what they did, which
   is what the operations page reads: this process is the only one that runs
   them, and the dev plugin serving the same routes runs neither. */
const limits = limitsFromEnv(process.env)
scheduleMaintenance({ db, root, limits, patches: createPatches(db), ops })

const handle = createApi({ db, limits, ops })

Bun.serve({
  port,
  /* Bound to every interface so the editor is reachable from a phone on the same
     network, which is how the panel gets tested on a touch screen. */
  hostname: '0.0.0.0',
  async fetch(request) {
    const api = await handle(request)
    if (api) return api

    const url = new URL(request.url)
    const file = Bun.file(join(dist, url.pathname === '/' ? 'index.html' : url.pathname))
    if (await file.exists()) return new Response(file)

    /* Anything else is a client route: hand back the app and let it decide. */
    return new Response(Bun.file(join(dist, 'index.html')), {
      headers: { 'content-type': 'text/html' },
    })
  },
})

/* Resolved rather than printed with a `./` in front, which assumed `root` was
   relative and collided as `.//data` against the container's own PM_DATA. An
   absolute path also says *which* checkout this is, the same reason the port is
   worth quoting when two worktrees are running. */
console.log(`PatchMemory on http://localhost:${port}  (data in ${resolve(root)})`)
