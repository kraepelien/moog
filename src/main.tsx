import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles'
import { App } from './App.tsx'
import { adoptLegacyHash } from './navigation/router.ts'
import { theme } from './theme.ts'
import './index.css'
import './panelPalette.css'

/* Before anything renders, so a link bookmarked while the routes lived in the
   fragment opens the page it names rather than the default one. */
adoptLegacyHash()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* injectFirst puts MUI's own styles above ours in the document, so a rule in
        a .module.css wins against MUI's class of equal specificity. Without it a
        component's stylesheet is a suggestion: MUI ships single-class rules for
        display and border-radius that would otherwise silently take precedence
        by injection order alone. */}
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </StyledEngineProvider>
  </StrictMode>,
)
