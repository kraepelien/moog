import { createTheme } from '@mui/material/styles'
import { SHELL, TONE_COLOURS } from './tones.ts'

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
    background: { default: SHELL.background, paper: SHELL.content },
    text: { primary: SHELL.ink, secondary: SHELL.inkDim },
    divider: SHELL.border,
    /* MUI hovers its own table rows, menu items and tabs out of this, so
       handing it the same property the library's rows use is what stops a skin
       repainting half the hovers on the page and leaving the rest white. */
    action: { hover: SHELL.hoverFaint, selected: SHELL.hoverStrong },

    /* The tones, handed to MUI under the names its own components reach for.
       Left unset these were MUI's defaults — a blue on every focused field,
       checkbox, tab indicator and pager, and a red on anything `color="error"`
       — none of which any skin could reach, so the Layout page repainted the
       app around them and they stayed. Each one is a tone that already has a
       swatch, so this adds no colour; it puts MUI inside the ones there are.

       `contrastText` is given rather than computed: MUI derives it from `main`
       by reading the value, and `main` here is a custom property it cannot
       read. */
    primary: { main: TONE_COLOURS.blue.ink, contrastText: SHELL.onTone },
    secondary: { main: TONE_COLOURS.violet.ink, contrastText: SHELL.onTone },
    error: { main: TONE_COLOURS.pink.ink, contrastText: SHELL.onTone },
    warning: { main: TONE_COLOURS.amber.ink, contrastText: SHELL.onTone },
    success: { main: TONE_COLOURS.green.ink, contrastText: SHELL.onTone },
    info: { main: TONE_COLOURS.blue.ink, contrastText: SHELL.onTone },
  },
  components: {
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'default' },
      styleOverrides: {
        root: {
          backgroundColor: SHELL.header,
          color: SHELL.headerInk,
          borderBottom: `1px solid ${SHELL.border}`,
        },
      },
    },
    /* Content is told apart from the background by its own border, so the
       default elevation shadow would only smudge it. */
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
  },
})
