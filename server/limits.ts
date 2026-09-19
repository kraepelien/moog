/* What open registration costs, kept small enough that nobody honest meets it.
   Anyone with a Google account can save onto somebody's NAS, and a runaway
   client can try to do it in a loop. */

export interface Limits {
  readonly maxPatches: number
  readonly maxPatchBytes: number
  readonly maxArrangements: number
  /* A MIDI file is the one thing here that arrives whole from outside, and a
     song is kilobytes: a megabyte is already a file nobody meant to upload. */
  readonly maxMidiBytes: number
  readonly trashDays: number
  readonly writesPerMinute: number
  readonly signInsPerMinute: number
}

/* The variable that sets each limit, named once. The operations page shows
   these beside the numbers, and a second copy of the names written there is one
   that goes stale the day a limit is renamed. Keyed on `keyof Limits`, so a
   limit added without a variable name fails to typecheck. */
export const LIMIT_ENV: Record<keyof Limits, string> = {
  maxPatches: 'PM_MAX_PATCHES',
  maxPatchBytes: 'PM_MAX_PATCH_BYTES',
  maxArrangements: 'PM_MAX_ARRANGEMENTS',
  maxMidiBytes: 'PM_MAX_MIDI_BYTES',
  trashDays: 'PM_TRASH_DAYS',
  writesPerMinute: 'PM_WRITES_PER_MINUTE',
  signInsPerMinute: 'PM_SIGN_INS_PER_MINUTE',
}

export function limitsFromEnv(env: Record<string, string | undefined>): Limits {
  const number = (name: keyof Limits, fallback: number) => {
    const raw = Number(env[LIMIT_ENV[name]])
    return Number.isFinite(raw) && raw > 0 ? raw : fallback
  }
  return {
    maxPatches: number('maxPatches', 2000),
    maxPatchBytes: number('maxPatchBytes', 64 * 1024),
    maxArrangements: number('maxArrangements', 200),
    maxMidiBytes: number('maxMidiBytes', 1024 * 1024),
    trashDays: number('trashDays', 30),
    writesPerMinute: number('writesPerMinute', 120),
    signInsPerMinute: number('signInsPerMinute', 10),
  }
}

interface Bucket {
  tokens: number
  filledAt: number
}

/* A token bucket per caller, in memory on purpose: a restart clearing it costs
   nothing, and the point is to stop a loop rather than to enforce a quota.
   Held per minute, so a burst is allowed and a flood is not. */
export function createRateLimiter(perMinute: number, now: () => number = Date.now) {
  const buckets = new Map<string, Bucket>()

  return {
    /* False when the caller has spent their minute. */
    allow(key: string): boolean {
      const at = now()
      const bucket = buckets.get(key) ?? { tokens: perMinute, filledAt: at }

      const refill = ((at - bucket.filledAt) / 60_000) * perMinute
      bucket.tokens = Math.min(perMinute, bucket.tokens + refill)
      bucket.filledAt = at

      if (bucket.tokens < 1) {
        buckets.set(key, bucket)
        return false
      }

      bucket.tokens -= 1
      buckets.set(key, bucket)

      /* Anything back at full has been idle for a minute and is not worth
         remembering; without this the map grows for every caller ever seen. */
      if (buckets.size > 1000) {
        for (const [otherKey, other] of buckets) {
          if (other.tokens >= perMinute && otherKey !== key) buckets.delete(otherKey)
        }
      }

      return true
    },
  }
}

/* Whoever is asking, for rate-limiting purposes only: a viewer if there is one,
   and otherwise where the request came from. Traefik puts the real address
   first in x-forwarded-for. */
export function callerKey(request: Request, viewerUid: string | null): string {
  if (viewerUid !== null) return `user:${viewerUid}`
  const forwarded = request.headers.get('x-forwarded-for')
  const address = forwarded?.split(',')[0]?.trim()
  return `ip:${address ?? 'unknown'}`
}
