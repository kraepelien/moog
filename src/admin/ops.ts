import type { Limits } from '@server/limits.ts'

/* What the housekeeping has done, as the operations page sees it. Shared with
   the server the way `users.ts` and `tags.ts` beside it are, so the two ends
   cannot disagree about the shape of an answer.

   Every figure is "since this process started". Nothing is written down: the
   record lives in memory and a restart clears it, which is honest, because a
   backup this process did not take is not a fact it knows. */

export interface BackupRun {
  readonly at: string
  readonly path: string
  /* False with the reason beside it. A backup that cannot be written is worth a
     line in the log and nothing more, so the page is where it stops being
     invisible. */
  readonly ok: boolean
  readonly error: string | null
}

export interface PurgeRun {
  readonly at: string
  readonly removed: number
  /* The cutoff it used, so the count means something without the reader working
     `trashDays` back out of the clock. */
  readonly olderThan: string
}

export interface FactoryRun {
  readonly loaded: number
  readonly kept: number
  readonly retired: number
  readonly refreshed: boolean
}

export interface OpsReport {
  readonly startedAt: string
  /* False under `bun run dev`: the Vite plugin serves the same API and runs no
     timer. Drawn as a reason rather than as a zero, because "no backup yet" and
     "nothing here takes backups" are not the same fact, and a zero would read
     as the first while meaning the second. */
  readonly scheduled: boolean
  readonly everyHours: number
  readonly backup: BackupRun | null
  readonly purge: PurgeRun | null
  /* Real in both, because both entry points seed the bank. */
  readonly factory: FactoryRun | null
  readonly database: { readonly path: string | null; readonly bytes: number | null }
  readonly limits: Limits
  /* Which variable sets each limit, so a reader knows what to change rather
     than which line of code to go and find. */
  readonly limitEnv: Record<keyof Limits, string>
}
