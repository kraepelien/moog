import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { TONE_COLOURS, type Tone } from '@/tones.ts'
import styles from './PatchBar.module.css'

/* Whether what is on the panel has been written down. Green is the whole of the
   feedback a save gives — there is no notification any more — so it has to be
   the resting state of a saved patch rather than a flash that is gone by the
   time anybody looks up. Amber is the other half of the same signal, and both
   are away from the white the rest of the page is set in. */
const TITLE_TONE: Record<'saved' | 'unsaved', Tone> = {
  saved: 'green',
  unsaved: 'amber',
}

export interface PatchBarButton {
  readonly label: string
  readonly tone: Tone
  readonly onSelect: () => void
  readonly disabled?: boolean
}

/* What the editor has open and what can be done to it, in the page rather than
   in a bar above it: the rail carries the navigation now, and a second strip
   across the top was height the instrument could have had. */
export function PatchBar({
  title,
  buttons,
}: {
  /* `owner` is set only where the patch is not yours, which is an administrator
     editing somebody else's. Green Save otherwise reads as "save mine", and
     whose it is has to be said before it is pressed rather than after. */
  readonly title: {
    readonly text: string
    readonly unsaved: boolean
    readonly owner?: string | null
  }
  readonly buttons: readonly PatchBarButton[]
}) {
  return (
    <Box className={styles.bar}>
      <Typography
        component="h2"
        className={styles.title}
        sx={{ color: TONE_COLOURS[TITLE_TONE[title.unsaved ? 'unsaved' : 'saved']].ink }}
      >
        {title.text || '(unnamed)'}
        {title.owner !== undefined && (
          <Typography component="span" className={styles.owner}>
            {title.owner === null ? 'somebody else’s patch' : `${title.owner}’s patch`}
          </Typography>
        )}
      </Typography>

      {/* The buttons and not the bar: on paper the name is the sheet's title,
          and nothing printed can be pressed. */}
      <Box className={styles.buttons} data-print="off">
        {buttons.map((button) => (
          <Button
            key={button.label}
            size="small"
            disabled={button.disabled}
            className={styles.button}
            onClick={button.onSelect}
            sx={{
              color: TONE_COLOURS[button.tone].ink,
              backgroundColor: TONE_COLOURS[button.tone].field,
              '&:hover': { backgroundColor: TONE_COLOURS[button.tone].strong },
            }}
          >
            {button.label}
          </Button>
        ))}
      </Box>
    </Box>
  )
}
