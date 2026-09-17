import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import Alert from '@mui/material/Alert'
import AppBar from '@mui/material/AppBar'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Slider from '@mui/material/Slider'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import { ThemeProvider } from '@mui/material/styles'
import { applySkin } from '@/skin.ts'
import { theme } from '@/theme.ts'

/* The app's own theme, rendered rather than read.

   Every colour in it is a custom property, and MUI does arithmetic on some of
   them: a chip fades its delete icon out of the body ink, a switch its track.
   That arithmetic cannot run on `var(--shell-ink)`, so the theme asks for
   `nativeColor`, which leaves the fading to the browser. Without it a Chip
   throws on render and takes the whole page down with it, and a component test
   that renders without the theme never finds out.

   Rendering each of these is the assertion. They are the components whose
   styles mix a palette colour rather than print it. */

afterEach(() => {
  cleanup()
  applySkin({}, document.documentElement)
})

describe('MUI chrome under the app theme', () => {
  test('a chip draws, delete icon and all', () => {
    render(
      <ThemeProvider theme={theme}>
        <Chip label="Bass" onDelete={() => {}} />
      </ThemeProvider>,
    )
    expect(screen.getByText('Bass')).toBeTruthy()
  })

  test('the components that mix a palette colour all draw', () => {
    render(
      <ThemeProvider theme={theme}>
        <AppBar>
          <Button variant="contained">Save</Button>
          <Alert severity="warning">Unsaved</Alert>
          <Switch defaultChecked />
          <Slider defaultValue={1} />
          <TextField label="Name" />
          <Paper>Card</Paper>
        </AppBar>
      </ThemeProvider>,
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })
})

/* The point of the custom properties: an administrator's skin repaints MUI's
   own chrome along with everything else, without the theme being rebuilt. A
   palette of hexes would render perfectly well and quietly stop doing this. */
test("a saved skin reaches MUI's palette", () => {
  applySkin({ card: '#123456' }, document.documentElement)
  render(
    <ThemeProvider theme={theme}>
      <Paper data-testid="card">Card</Paper>
    </ThemeProvider>,
  )
  expect(getComputedStyle(screen.getByTestId('card')).backgroundColor).toBe('#123456')
})
