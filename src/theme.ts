import { createTheme } from '@mui/material/styles'
import { SHELL } from './tones.ts'

/* MUI ships Roboto as its default face and this project does not load it, so
   without this the chrome would fall back to a system font while the panel
   legends stayed Google Sans Flex. The family is the one :root sets.

   Dark throughout, at the instrument's own black rather than MUI's grey: the
   panel is white ink on black, and a light page around it made the panel a
   window rather than the thing on the page. */
export const theme = createTheme({
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
          backgroundColor: SHELL.page,
          color: SHELL.ink,
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
