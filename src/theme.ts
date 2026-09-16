import { createTheme } from '@mui/material/styles'

/* MUI ships Roboto as its default face and this project does not load it, so
   without this the chrome would fall back to a system font while the panel
   legends stayed Google Sans Flex. The family is the one :root sets. */
export const theme = createTheme({
  typography: {
    fontFamily: "'Google Sans Flex Variable', system-ui, sans-serif",
  },
})
