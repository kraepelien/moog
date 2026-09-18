import { join, resolve } from 'node:path'
import { createApi } from './api.ts'
import { backupTo, openDatabase } from './db.ts'
import { loadFactory } from './factory.ts'
import { limitsFromEnv } from './limits.ts'
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

const root = process.env.MOOG_DATA ?? 'data'
const seed = process.env.MOOG_BANK ?? 'bank'
const dist = process.env.MOOG_DIST ?? 'dist'
const port = Number(process.env.PORT ?? 5174)

const db = openDatabase(join(root, 'moog.db'))
/* Off unless asked for, and asked for per start rather than stored: the whole
   value of a reseed is that it is a decision somebody makes out loud, and a
   flag left in a compose file would quietly undo every correction at the next
   restart. */
const reseed = process.env.MOOG_RESEED === '1'
const factory = loadFactory(db, seed, { reseed })
seedTags(db)
console.log(
  reseed
    ? `Factory bank: ${factory.loaded} patches RESEEDED from ${seed}, ${factory.retired} retired`
    : factory.refreshed
      ? `Factory bank: ${factory.loaded} patches refreshed from ${seed} — a one-off, and the last one until the number is raised again`
      : `Factory bank: ${factory.loaded} new, ${factory.kept} kept, ${factory.retired} retired`,
)
if (reseed) console.warn('MOOG_RESEED=1 was set: any edits to factory patches have been overwritten.')
console.log(`Sign-in: ${describeAuth(authConfigFromEnv(process.env))}`)
const envTroubleFound = envTrouble(dirAt(process.cwd()), process.env)
if (envTroubleFound) console.warn(envTroubleFound)

/* Trash is a grace period, not a place things stay. */
const limits = limitsFromEnv(process.env)
const patches = createPatches(db)
const purge = () => {
  const before = new Date(Date.now() - limits.trashDays * 24 * 60 * 60 * 1000).toISOString()
  const gone = patches.purgeTrash(before)
  if (gone > 0) console.log(`Purged ${gone} from the trash, deleted over ${limits.trashDays} days ago`)
}
purge()

/* A dated copy every day, because a plain file copy of a database in WAL mode
   can catch it mid-write and the backup on the NAS is a file copy. */
const backup = () => {
  /* A backup that cannot be written is worth a line in the log and nothing
     more: the editor still works, and a container that exits here would be
     restarted into the same failure. */
  try {
    backupTo(db, join(root, 'backups', `moog-${new Date().toISOString().slice(0, 10)}.db`))
  } catch (error) {
    console.error('Backup failed:', error)
  }
}
backup()
setInterval(() => {
  purge()
  backup()
}, 24 * 60 * 60 * 1000)

const handle = createApi({ db, limits })

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
   relative and collided as `.//data` against the container's own MOOG_DATA. An
   absolute path also says *which* checkout this is, the same reason the port is
   worth quoting when two worktrees are running. */
console.log(`Minimoog patch editor on http://localhost:${port}  (data in ${resolve(root)})`)
