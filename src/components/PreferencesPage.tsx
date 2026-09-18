import Alert from '@mui/material/Alert'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormLabel from '@mui/material/FormLabel'
import Paper from '@mui/material/Paper'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { NavPreference } from '@storage/deviceNav.ts'
import type { NavPlacement } from './navPlacement.ts'

/* What somebody has asked this browser to do, as opposed to what an
 * administrator sets for everybody. Nothing here reaches the server: these are
 * choices about a screen, and the screen is the machine they are made on.
 */
export function PreferencesPage({
  nav,
  placement,
  onNav,
}: {
  nav: NavPreference
  /* Where the nav actually is, which is not always what was chosen: a narrow
     window has no room for the rail. */
  placement: NavPlacement
  onNav: (next: NavPreference) => void
}) {
  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Preferences
        </Typography>

        <Typography sx={{ mb: 2 }} color="text.secondary">
          Kept in this browser, on this machine. Signing in somewhere else starts from the
          defaults.
        </Typography>

        <FormControl>
          <FormLabel id="nav-placement">Menu</FormLabel>
          <RadioGroup
            aria-labelledby="nav-placement"
            value={nav}
            onChange={(_event, next) => onNav(next as NavPreference)}
          >
            <FormControlLabel
              value="window"
              control={<Radio />}
              label="Follow the window: down the left when there is room, across the top when there is not"
            />
            <FormControlLabel
              value="top"
              control={<Radio />}
              label="Always across the top, and stuck there as the page scrolls"
            />
          </RadioGroup>
        </FormControl>

        {/* Said here rather than left to be discovered: choosing the rail on a
            phone changes nothing on the screen, and a setting that appears not
            to work reads as a broken setting. */}
        {nav === 'window' && placement === 'top' && (
          <Alert severity="info" sx={{ mt: 2 }}>
            This window is too narrow for the rail, so the menu is across the top for now. Widen it
            and the rail comes back.
          </Alert>
        )}
      </Paper>
    </Stack>
  )
}
