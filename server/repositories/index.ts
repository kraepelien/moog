import type { Database } from 'bun:sqlite'
import { createAppSettings } from './appSettings.ts'
import { createArrangements } from './arrangements.ts'
import { createLibrary } from './library.ts'
import { createPatches } from './patches.ts'
import { createRatings } from './ratings.ts'
import { createSettings } from './settings.ts'
import { createTags } from './tags.ts'
import { createUsers } from './users.ts'

/* One open database, one set of repositories over it, built once per server.
   Statements are prepared as each repository is created, so building this per
   request would re-prepare every one of them. */

export function createRepositories(db: Database) {
  return {
    db,
    appSettings: createAppSettings(db),
    patches: createPatches(db),
    ratings: createRatings(db),
    settings: createSettings(db),
    tags: createTags(db),
    users: createUsers(db),
    library: createLibrary(db),
    arrangements: createArrangements(db),
  }
}

export type Repositories = ReturnType<typeof createRepositories>
