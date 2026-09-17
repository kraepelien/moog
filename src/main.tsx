import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles'
import { App } from './App.tsx'
import { adoptLegacyHash } from './navigation/router.ts'
import { applySkin } from './skin.ts'
import { createHttpStore } from './storage/httpStore.ts'
import { theme } from './theme.ts'
import type { Skin } from './tones.ts'
import './index.css'
import './shellPalette.css'
import './panelPalette.css'

/* Before anything renders, so a link bookmarked while the routes lived in the
   fragment opens the page it names rather than the default one. */
adoptLegacyHash()

/* Also before anything renders, and before the session is even asked about:
   whatever colours an administrator saved are the app's colours on the sign-in
   page too, and painting after the first frame would show everybody the
   defaults flashing past. A server that cannot answer is not a reason to show
   nothing — the app says so itself, in whatever colours the stylesheet gives. */
void createHttpStore()
  .getSkin()
  .catch((): Skin => ({}))
  .then((skin) => {
    applySkin(skin, document.documentElement)
    draw(skin)
  })

function draw(skin: Skin) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* injectFirst puts MUI's own styles above ours in the document, so a rule
          in a .module.css wins against MUI's class of equal specificity. Without
          it a component's stylesheet is a suggestion: MUI ships single-class
          rules for display and border-radius that would otherwise silently take
          precedence by injection order alone. */}
      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <App skin={skin} />
        </ThemeProvider>
      </StyledEngineProvider>
    </StrictMode>,
  )
}
