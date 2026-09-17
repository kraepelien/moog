import { cleanSkin, type Skin } from '@/tones.ts'
import type { Repositories } from '@server/repositories/index.ts'

/* The app's colours, as one administrator-set object.

   A service rather than a route reading its repository, because there is a rule:
   a skin is sifted down to the keys the app declares and to values that are
   really colours, in `cleanSkin`, shared with the browser so the page cannot
   offer something the server then refuses.

   Sifting rather than refusing is deliberate in both directions. A key this
   build does not know is dropped on the way out too, so a skin saved by a newer
   build renders as this build's defaults instead of putting an unknown string
   into a style attribute. And a skin is partial by design: an unset colour is
   the default, so adding a colour to the list never needs a migration. */

const KEY = 'skin'

export function createSkinService(repositories: Repositories) {
  const { appSettings } = repositories

  return {
    get: (): Skin => cleanSkin(appSettings.of(KEY)),

    put(raw: unknown): Skin {
      const kept = cleanSkin(raw)
      appSettings.put(KEY, kept)
      return kept
    },
  }
}

export type SkinService = ReturnType<typeof createSkinService>
