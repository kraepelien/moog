import { migrateToCurrent } from '@patch/migrate.ts'
import type { PatchRecord } from '@patch/record.ts'
import type { Patch } from '@patch/schema.ts'
import type { AdminUser } from '@admin/users.ts'
import type { LibraryEntry } from '@components/library/entry.ts'
import type { OpsReport } from '@admin/ops.ts'
import type { Tag, TagInUse } from '@admin/tags.ts'
import type {
  Arrangement,
  ArrangementInput,
  ArrangementSummary,
} from '@components/midi/arrangement.ts'
import {
  StoreError,
  type AdminStore,
  type UserStore,
  type ArrangementStore,
  type LibraryStore,
  type OpsStore,
  type PatchAdminStore,
  type PatchStore,
  type PatchSummary,
  type TagStore,
} from './types.ts'

/* The same interface a browser-storage adapter once implemented, which is why
   it was async from the first commit while still backed by something
   synchronous. `deviceSkin.ts` beside it is not one of these: it is synchronous
   on purpose, because it is read before the first frame. */

const BASE = '/api'

/* A parameter so a test can drive this against the real handler with no
   socket, exercising the path the browser takes rather than a stand-in. */
export type Fetch = (path: string, init?: RequestInit) => Promise<Response>

/* Exported for its own test: no store method passes a header yet, so the merge
   below would otherwise be checked by nothing. */
function readError(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: unknown }
    return typeof parsed.error === 'string' && parsed.error.length > 0 ? parsed.error : null
  } catch {
    return null
  }
}

export async function requestWith(
  doFetch: Fetch,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response
  try {
    response = await doFetch(BASE + path, {
      ...init,
      /* After the default, not before: the other way round dropped a caller's
         header without saying so. */
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
      /* Already the default here, but the session depends on it. */
      credentials: 'same-origin',
    })
  } catch (cause) {
    /* The server owning the files is not answering. Distinct from a rejected
       request, and the only failure a user can actually act on. */
    throw new StoreError('unavailable', 'Cannot reach the patch server.', { cause })
  }

  if (response.status === 404) return null
  if (response.status === 401) {
    throw new StoreError('unauthenticated', 'Sign in to do that.')
  }
  /* The server says why, and the reasons differ: somebody else's patch, a
     factory patch, or a privilege this account does not hold. A single
     invented sentence here was wrong for two of the three. */
  if (response.status === 403) {
    const said = readError(await response.text().catch(() => ''))
    throw new StoreError('forbidden', said ?? 'This account is not allowed to do that.')
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    /* Routes refuse in a sentence meant for a person — a cap, a duplicate — and
       wrapping it in the status code buries the only part worth reading. */
    const said = readError(detail)
    throw new StoreError(
      'io',
      said ?? `Storage request failed (${response.status}). ${detail}`.trim(),
    )
  }

  /* A page fallback or a proxy's error page answering instead of the API;
     letting JSON.parse throw would surface it as an unrelated SyntaxError. */
  try {
    return await response.json()
  } catch (cause) {
    throw new StoreError('io', 'The patch server answered with something that is not JSON.', {
      cause,
    })
  }
}

/* A file somebody edited by hand may not parse, and one written by a newer build
   may be a version this one cannot read. Both are skipped rather than thrown, so
   a single bad file cannot empty the list. */
function toPatch(raw: unknown): Patch | null {
  const migrated = migrateToCurrent(raw)
  return migrated.ok ? migrated.value : null
}

export function createHttpStore(
  doFetch: Fetch = (path, init) => fetch(path, init),
): PatchStore &
  LibraryStore &
  TagStore &
  AdminStore &
  ArrangementStore &
  UserStore &
  OpsStore &
  PatchAdminStore {
  const request = (path: string, init?: RequestInit) => requestWith(doFetch, path, init)

  return {
    async list(): Promise<readonly PatchSummary[]> {
      const raw = (await request('/patches')) as unknown[]
      return raw
        .map(toPatch)
        .filter((patch): patch is Patch => patch !== null)
        .map(({ id, name, tags, instrument, visibility, createdAt, updatedAt }) => ({
          id,
          name,
          tags,
          instrument,
          visibility,
          createdAt,
          updatedAt,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },

    async get(id: string): Promise<Patch | null> {
      const raw = await request(`/patches/${encodeURIComponent(id)}`)
      return raw === null ? null : toPatch(raw)
    },

    async create(patch: Patch, from?: string): Promise<Patch> {
      const raw = await request('/patches', {
        method: 'POST',
        body: JSON.stringify(from === undefined ? patch : { ...patch, from }),
      })
      const stored = toPatch(raw)
      if (!stored) throw new StoreError('io', 'The server stored something unreadable.')
      return stored
    },

    async save(patch: Patch): Promise<Patch> {
      await request(`/patches/${encodeURIComponent(patch.id)}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      })
      return patch
    },

    async delete(id: string): Promise<void> {
      await request(`/patches/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    async library(instrument?: string): Promise<readonly LibraryEntry[]> {
      const path = instrument === undefined ? '/library' : `/library?instrument=${encodeURIComponent(instrument)}`
      return ((await request(path)) ?? []) as LibraryEntry[]
    },

    async rate(id: string, stars: number): Promise<void> {
      await request(`/patches/${encodeURIComponent(id)}/rating`, {
        method: 'PUT',
        body: JSON.stringify({ stars }),
      })
    },

    async listTags(): Promise<readonly Tag[]> {
      return ((await request('/tags')) ?? []) as Tag[]
    },

    async listTagsInUse(): Promise<readonly TagInUse[]> {
      return ((await request('/tags/in-use')) ?? []) as TagInUse[]
    },

    async addTag(name: string): Promise<void> {
      await request('/tags', { method: 'POST', body: JSON.stringify({ name }) })
    },

    async setTagColour(id: number, colour: string | null): Promise<void> {
      await request(`/tags/${id}/colour`, { method: 'PUT', body: JSON.stringify({ colour }) })
    },

    async removeTag(id: number): Promise<void> {
      await request(`/tags/${id}`, { method: 'DELETE' })
    },

    async listArrangements(): Promise<readonly ArrangementSummary[]> {
      return ((await request('/arrangements')) ?? []) as ArrangementSummary[]
    },

    async getArrangement(id: string): Promise<Arrangement | null> {
      return (await request(`/arrangements/${encodeURIComponent(id)}`)) as Arrangement | null
    },

    async createArrangement(arrangement: ArrangementInput): Promise<Arrangement> {
      return (await request('/arrangements', {
        method: 'POST',
        body: JSON.stringify(arrangement),
      })) as Arrangement
    },

    async saveArrangement(id: string, arrangement: ArrangementInput): Promise<Arrangement> {
      return (await request(`/arrangements/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(arrangement),
      })) as Arrangement
    },

    async deleteArrangement(id: string): Promise<void> {
      await request(`/arrangements/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    async listEveryPatch(): Promise<readonly PatchRecord[]> {
      return (await request('/patches/all')) as readonly PatchRecord[]
    },

    async unpublish(id: string): Promise<void> {
      await request(`/patches/${encodeURIComponent(id)}/unpublish`, { method: 'POST' })
    },

    async listTrash(): Promise<readonly PatchRecord[]> {
      return (await request('/patches/trash')) as readonly PatchRecord[]
    },

    async restore(id: string): Promise<void> {
      await request(`/patches/${encodeURIComponent(id)}/restore`, { method: 'POST' })
    },

    async ops(): Promise<OpsReport> {
      return (await request('/ops')) as OpsReport
    },

    async listUsers(): Promise<readonly AdminUser[]> {
      return ((await request('/users')) ?? []) as AdminUser[]
    },

    async setUserRoles(uid: string, roles: readonly string[]): Promise<AdminUser> {
      return (await request(`/users/${encodeURIComponent(uid)}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ roles }),
      })) as AdminUser
    },

    async setUserPrivilege(
      uid: string,
      privilege: string,
      granted: boolean,
    ): Promise<AdminUser> {
      return (await request(
        `/users/${encodeURIComponent(uid)}/privileges/${encodeURIComponent(privilege)}`,
        { method: 'PUT', body: JSON.stringify({ granted }) },
      )) as AdminUser
    },

    async clearUserPrivilege(uid: string, privilege: string): Promise<AdminUser> {
      return (await request(
        `/users/${encodeURIComponent(uid)}/privileges/${encodeURIComponent(privilege)}`,
        { method: 'DELETE' },
      )) as AdminUser
    },
  }
}
