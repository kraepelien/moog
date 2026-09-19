import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles'
import { App } from './App.tsx'
import { adoptLegacyHash } from './navigation/router.ts'
import { applySkin } from './skin.ts'
import { createDeviceNav } from './storage/deviceNav.ts'
import { createDeviceRail } from './storage/deviceRail.ts'
import { createDeviceSkin, type StorageLike } from './storage/deviceSkin.ts'
import { theme } from './theme.ts'
import type { Skin } from './tones.ts'
import './index.css'
import './shellPalette.css'
import './panelPalette.css'
import './print.css'

/* Before anything renders, so a link bookmarked while the routes lived in the
   fragment opens the page it names rather than the default one. */
adoptLegacyHash()

/* The one place in the app that knows a browser has storage. Everything below
   is handed a skin and a way to keep one, and never learns where it went.

   Reading the property is itself what throws where site data is blocked, so
   this is a probe rather than a null check. */
function deviceStorage(): StorageLike | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/* The rail is folded for as long as somebody wants it folded, which outlives the
   tab a previewed skin belongs to. */
function lastingStorage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/* Also before anything renders: a preview somebody is in the middle of is the
   app's colours on the sign-in page too, and painting after the first frame
   would show them the defaults flashing past. Synchronous, so there is no frame
   in which that could happen. */
const device = createDeviceSkin(deviceStorage())
const rail = createDeviceRail(lastingStorage())
const nav = createDeviceNav(lastingStorage())
const skin = device.read()
applySkin(skin, document.documentElement)
draw(skin)

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
          <App
            skin={skin}
            keepSkin={(next) => device.write(next)}
            railCollapsed={rail.read()}
            keepRail={(next) => rail.write(next)}
            navPreference={nav.read()}
            keepNav={(next) => nav.write(next)}
          />
        </ThemeProvider>
      </StyledEngineProvider>
    </StrictMode>,
  )
}
