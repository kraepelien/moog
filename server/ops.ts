import { statSync } from 'node:fs'
import { join } from 'node:path'
import type { Database } from 'bun:sqlite'
import type { BackupRun, FactoryRun, OpsReport, PurgeRun } from '@admin/ops.ts'
import { backupTo } from './db.ts'
import { LIMIT_ENV, type Limits } from './limits.ts'
import type { createPatches } from './repositories/patches.ts'

/* The housekeeping, and the record of what it did. One file rather than two,
   because a schedule and the log of that schedule are one subject, and a module
   holding a three-field struct would be a worse map of the server than this.

   Constructed rather than imported as a module singleton: `createApi` is called
   several times inside one test file, and a shared record would leak one test's
   backup into the next one's assertions. `createRateLimiter` avoids the same
   trap the same way.

   This decides *when*, never *how*: the purge is the patches repository's, the
   copy is `backupTo`'s, and no SQL is written here. */

const DAY_MS = 24 * 60 * 60 * 1000
const EVERY_HOURS = 24

export interface OpsLog {
  recordFactory(load: FactoryRun): void
  recordBackup(run: BackupRun): void
  recordPurge(run: PurgeRun): void
  /* Said once by whoever actually starts the timer, so the page can tell a
     server that takes backups from one that only serves the same routes. */
  markScheduled(): void
  report(limits: Limits): OpsReport
}

export interface OpsLogOptions {
  readonly now?: () => number
  /* Given by whoever opened the database, since the API is handed the handle
     and never the path. Null where nothing said, which is every test and any
     caller that did not care. */
  readonly databasePath?: string | null
}

export function createOpsLog({ now = Date.now, databasePath = null }: OpsLogOptions = {}): OpsLog {
  const startedAt = new Date(now()).toISOString()
  let scheduled = false
  let backup: BackupRun | null = null
  let purge: PurgeRun | null = null
  let factory: FactoryRun | null = null

  return {
    recordFactory: (load) => void (factory = load),
    recordBackup: (run) => void (backup = run),
    recordPurge: (run) => void (purge = run),
    markScheduled: () => void (scheduled = true),
    report: (limits) => ({
      startedAt,
      scheduled,
      everyHours: EVERY_HOURS,
      backup,
      purge,
      factory,
      database: { path: databasePath, bytes: databasePath === null ? null : sizeOf(databasePath) },
      limits,
      limitEnv: LIMIT_ENV,
    }),
  }
}

/* The database file *and* its write-ahead log, because in WAL mode the main
   file stays tiny until a checkpoint and everything written since lives beside
   it: a fresh install reported 4 KiB while its own backup was 139 KB, which is
   a figure that makes somebody doubt the page rather than the number.

   Null rather than nothing when a file cannot be stat'd, since the page is a
   window onto the housekeeping and a size that cannot be read is worth seeing.
   A missing `-wal` is not a failure though: it means the log is checkpointed,
   so that one counts as zero. */
function sizeOf(path: string): number | null {
  try {
    return statSync(path).size + bytesAt(`${path}-wal`)
  } catch {
    return null
  }
}

function bytesAt(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

export interface Housekeeping {
  readonly db: Database
  readonly root: string
  readonly limits: Limits
  readonly patches: ReturnType<typeof createPatches>
  readonly ops: OpsLog
  /* Injected so the failure branch can be exercised without making a directory
     unwritable, the same reason the token exchange takes its `fetch`. */
  readonly backup?: typeof backupTo
  readonly now?: () => number
}

/* One cycle. Separate from the scheduler on purpose: a test that called the
   scheduler would leave a live `setInterval` holding the suite open. */
export function runMaintenance(deps: Housekeeping): void {
  const now = deps.now ?? Date.now
  const at = new Date(now()).toISOString()

  const olderThan = new Date(now() - deps.limits.trashDays * DAY_MS).toISOString()
  const removed = deps.patches.purgeTrash(olderThan)
  deps.ops.recordPurge({ at, removed, olderThan })
  if (removed > 0) {
    console.log(`Purged ${removed} from the trash, deleted over ${deps.limits.trashDays} days ago`)
  }

  /* A dated copy, because a plain file copy of a database in WAL mode can catch
     it mid-write and the backup on the NAS is a file copy. */
  const path = join(deps.root, 'backups', `moog-${at.slice(0, 10)}.db`)
  try {
    ;(deps.backup ?? backupTo)(deps.db, path)
    deps.ops.recordBackup({ at, path, ok: true, error: null })
  } catch (error) {
    /* A backup that cannot be written is worth a line in the log and nothing
       more: the editor still works, and a container that exited here would be
       restarted into the same failure. Recorded as well now, so the answer to
       "did last night's run work" is a page rather than an ssh session. */
    const message = error instanceof Error ? error.message : String(error)
    console.error('Backup failed:', message)
    deps.ops.recordBackup({ at, path, ok: false, error: message })
  }
}

/* The timer runs from process start rather than at a wall-clock hour, which is
   what `setInterval` does and what the page says, because an operator expecting
   03:00 would otherwise be wrong. */
export function scheduleMaintenance(deps: Housekeeping): { stop(): void } {
  deps.ops.markScheduled()
  runMaintenance(deps)
  const timer = setInterval(() => runMaintenance(deps), EVERY_HOURS * 60 * 60 * 1000)
  return { stop: () => clearInterval(timer) }
}
