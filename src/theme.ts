import { createTheme } from '@mui/material/styles'

/* MUI ships Roboto as its default face and this project does not load it, so
   without this the chrome would fall back to a system font while the panel
   legends stayed Google Sans Flex. The family is the one :root sets.

   The bar is near-black like the instrument rather than the theme's primary
   colour: the panel is the loudest thing on the page and the chrome should not
   compete with it. */
export const theme = createTheme({
  typography: {
    fontFamily: "'Google Sans Flex Variable', system-ui, sans-serif",
  },
  components: {
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'default' },
      styleOverrides: {
        root: {
          backgroundColor: '#141416',
          color: '#e9e9ec',
          borderBottom: '1px solid rgb(255 255 255 / 12%)',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          color: '#a5a5ae',
          borderColor: 'rgb(255 255 255 / 20%)',
          '&.Mui-selected': { color: '#ffffff', backgroundColor: 'rgb(255 255 255 / 14%)' },
        },
      },
    },
  },
})
