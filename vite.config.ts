import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'
import { patchApi } from './server/vitePlugin.ts'

export default defineConfig({
  plugins: [
    react(),
    svgr(),
    /* Patches and presets are files on disk, served over /api by the dev server
       so there is no second process to run while working. `presets/` is the
       bank kept in the repo; `data/` is the working copy, and is gitignored. */
    patchApi({ root: 'data', seed: 'presets' }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    watch: {
      /* Worktrees live inside the project, so without this the dev server
         watches every other one: a build in a second worktree reloads the page
         in this one, naming a file that is not in this tree at all. Added to
         Vite's own ignores rather than replacing them. */
      ignored: ['**/.claude/worktrees/**'],
    },
  },
})
