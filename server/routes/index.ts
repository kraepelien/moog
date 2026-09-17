import { arrangementRoutes } from './arrangements.ts'
import { miscRoutes } from './misc.ts'
import { patchRoutes } from './patches.ts'
import type { Route } from './table.ts'
import { tagRoutes } from './tags.ts'

/* Everything under /api/ except sign-in, which is not a table route: it sets
   cookies, talks to Google and has to be reachable by somebody who has no
   session yet, so it runs before a viewer is even looked up. */
export const allRoutes: readonly Route[] = [
  ...miscRoutes,
  ...tagRoutes,
  ...patchRoutes,
  ...arrangementRoutes,
]
