import { createTheme } from '@mui/material/styles'
import { SHELL } from './tones.ts'

/* MUI ships Roboto as its default face and this project does not load it, so
   without this the chrome would fall back to a system font while the panel
   legends stayed Google Sans Flex. The family is the one :root sets.

   Dark throughout, at the instrument's own black rather than MUI's grey: the
   panel is white ink on black, and a light page around it made the panel a
   window rather than the thing on the page.

   Every colour is a custom property rather than a value, so a skin an
   administrator saves repaints MUI's own chrome along with everything else and
   the theme never has to be rebuilt. `nativeColor` is what lets that hold: MUI
   mixes some palette colours rather than printing them (a chip's delete icon
   out of the body ink, a switch's track), and that arithmetic cannot run on
   `var(--shell-ink)`, so a Chip threw on render and took the page down with it.
   With it the mixing is left to the browser as `oklch(from ...)`, and the
   properties a contrast colour needs are declared alongside the palette. */
export const theme = createTheme({
  cssVariables: { nativeColor: true },
  typography: {
    fontFamily: "'Google Sans Flex Variable', system-ui, sans-serif",
  },
  palette: {
    mode: 'dark',
    background: { default: SHELL.page, paper: SHELL.card },
    text: { primary: SHELL.ink, secondary: SHELL.inkDim },
    divider: SHELL.edge,
  },
  components: {
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'default' },
      styleOverrides: {
        root: {
          backgroundColor: SHELL.bar,
          color: SHELL.barInk,
          borderBottom: `1px solid ${SHELL.edge}`,
        },
      },
    },
    /* Cards are told apart from the page by their own edge, so the default
       elevation shadow would only smudge it. */
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
  },
})
