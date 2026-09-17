import type { Database } from 'bun:sqlite'
import { tagNameProblem } from '@admin/tags.ts'
import { createTags, type Tag } from '@server/repositories/tags.ts'
import type { Repositories } from '@server/repositories/index.ts'
import type { Refusal } from './refusal.ts'

/* Unlike instruments, the tag list is **seeded once rather than synced**.
   Instruments are code: a registry, artwork and codecs, so the image is the
   authority and re-asserting them on every start is right. Categories are
   somebody's editorial list, and re-asserting these would undo a deletion at
   the next restart — the admin page would appear not to work. */

export const INITIAL_TAGS: readonly string[] = [
  'Bass',
  'Lead',
  'Pluck',
  'Bell',
  'Synth',
  'Keys',
  'Brass',
  'Strings',
  'Pad',
  'Stabs',
  'Drones',
  'FX',
]

/* Only into an empty table, which is what makes this a starting point rather
   than a default that keeps coming back. Returns how many it wrote so a start
   can say whether it was a first one. */
export function seedTags(db: Database, names: readonly string[] = INITIAL_TAGS): number {
  const tags = createTags(db)
  if (tags.count() > 0) return 0
  return tags.insertMany(names)
}

export function createTagService(repositories: Repositories) {
  const { tags } = repositories

  return {
    list: () => tags.list(),
    listInUse: () => tags.listInUse(),

    add(name: unknown): Tag | Refusal {
      if (typeof name !== 'string') return { error: 'invalid body', status: 400 }

      const trimmed = name.trim()
      const problem = tagNameProblem(trimmed)
      if (problem !== null) return { error: problem, status: 400 }

      if (tags.findByName(trimmed)) {
        return { error: 'that tag is already on the list', status: 409 }
      }
      return tags.insert(trimmed)
    },

    remove(id: number): true | Refusal {
      if (!Number.isInteger(id)) return { error: 'invalid id', status: 400 }
      if (!tags.delete(id)) return { error: 'not found', status: 404 }
      return true
    },
  }
}

export type TagService = ReturnType<typeof createTagService>
