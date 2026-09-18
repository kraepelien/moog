import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'
/* Relative, and it has to stay that way: this import is what pulls the whole
   server graph into loading this file, and the aliases below are not in force
   during that. See `--configLoader native` in package.json. */
import { patchApi } from './server/vitePlugin.ts'

/* Read rather than restated, because tsc, Bun and Vite each resolve the aliases
   themselves: a list duplicated here would go out of step silently, typechecking
   clean while the dev server 404s on the import it cannot map. Kept free of
   comments so it stays parseable as plain JSON. */
const { compilerOptions } = JSON.parse(
  readFileSync(new URL('./tsconfig.paths.json', import.meta.url), 'utf8'),
) as { compilerOptions: { paths: Record<string, string[]> } }

const alias = Object.entries(compilerOptions.paths).map(([pattern, [target]]) => ({
  find: pattern.replace(/\/\*$/, ''),
  replacement: fileURLToPath(new URL(target.replace(/\/\*$/, ''), import.meta.url)),
}))

export default defineConfig({
  plugins: [
    react(),
    svgr(),
    /* The patches are a database on disk, served over /api by the dev server so
       there is no second process to run while working. `bank/` is the factory
       bank kept in the repo; `data/` is the working copy, and is gitignored. */
    patchApi({ root: 'data', seed: 'bank' }),
  ],
  resolve: { alias },
  server: {
    watch: {
      /* Worktrees live inside the project, so without this the dev server
         watches every other one: a build in a second worktree reloads the page
         in this one, naming a file that is not in this tree at all. Added to
         Vite's own ignores rather than replacing them.

         Anchored at this tree's own root rather than left as a bare glob, which
         a worktree's own path matches: started from inside one, the dev server
         ignored the entire checkout it was serving and watched nothing of its
         own, with no HMR and no sign anything was wrong beyond an app that
         never updated. */
      ignored: [fileURLToPath(new URL('./.claude/worktrees/**', import.meta.url))],
    },
  },
})
