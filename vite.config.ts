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
})
