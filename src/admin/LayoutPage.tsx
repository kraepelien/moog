import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ColourField } from './ColourField.tsx'
import { StarRating } from '@components/library/StarRating.tsx'
import { ToneChip } from '@components/library/ToneChip.tsx'
import { skinValue } from '@/skin.ts'
import { DEFAULT_SKIN, SKIN_SWATCHES, TONE_COLOURS, TONES, type Skin } from '@/tones.ts'
import styles from './LayoutPage.module.css'

/* Where the app's colours are chosen.
 *
 * There is no preview pane, because the preview is the page: every field writes
 * straight onto :root, so the bar, the cards, the chips and the text under the
 * cursor all move as the picker moves. A swatch grid beside a miniature of the
 * app would be a second thing to keep in step with the first, and would still
 * be lying about the one surface it could not contain — the one it is drawn on.
 *
 * That is also why leaving is a real question. The paint is on the document
 * before it is on the server, so a draft that is walked away from has to be
 * taken back off; `onDraft` is how the page above does it.
 */
export function LayoutPage({
  skin,
  draft,
  onDraft,
  onSave,
}: {
  /* What the server holds. Revert goes back to this, and it is what says
     whether there is anything to save. */
  skin: Skin
  /* What the fields are showing, which is also what the document is painted
     with. Owned above so that leaving the page can put the paint back. */
  draft: Skin
  onDraft: (next: Skin) => void
  onSave: (next: Skin) => void
}) {
  const changed = JSON.stringify(draft) !== JSON.stringify(skin)

  const set = (key: string, hex: string) => {
    /* A colour equal to the stylesheet's is an absence rather than a choice, so
       it is dropped: a skin holds only what somebody decided, and a default
       that moves later reaches everyone who never said otherwise. */
    const next = { ...draft }
    if (hex === DEFAULT_SKIN[key]) delete next[key]
    else next[key] = hex
    onDraft(next)
  }

  const groups = ['Shell', 'Tones'] as const

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" className={styles.page}>
        <Box className={styles.head}>
          <Typography variant="h6" component="h2">
            Layout
          </Typography>
          <Box className={styles.actions}>
            <Button
              size="small"
              disabled={!changed}
              onClick={() => onDraft(skin)}
              sx={{ color: TONE_COLOURS.grey.ink, backgroundColor: TONE_COLOURS.grey.field }}
            >
              Revert
            </Button>
            <Button
              size="small"
              disabled={Object.keys(draft).length === 0}
              onClick={() => onDraft({})}
              sx={{ color: TONE_COLOURS.pink.ink, backgroundColor: TONE_COLOURS.pink.field }}
            >
              Defaults
            </Button>
            <Button
              size="small"
              disabled={!changed}
              onClick={() => onSave(draft)}
              sx={{ color: TONE_COLOURS.green.ink, backgroundColor: TONE_COLOURS.green.field }}
            >
              Save
            </Button>
          </Box>
        </Box>

        <Alert severity="info" className={styles.note}>
          The page repaints as you pick, so what you see is what it will look
          like — but nobody else sees any of it until you press Save. These
          colours belong to the installation rather than to your account, so
          saving repaints the app for everyone.
        </Alert>

        {groups.map((group) => (
          <Box key={group} className={styles.group}>
            <Typography variant="subtitle2" component="h3" className={styles.groupName}>
              {group}
            </Typography>
            <Box className={styles.grid}>
              {SKIN_SWATCHES.filter((swatch) => swatch.group === group).map((swatch) => (
                <ColourField
                  key={swatch.key}
                  label={swatch.label}
                  hint={swatch.hint}
                  value={skinValue(draft, swatch.key)}
                  onChange={(hex) => set(swatch.key, hex)}
                />
              ))}
            </Box>
          </Box>
        ))}
      </Paper>

      {/* Not a preview of the page — the page is that. This is the handful of
          things a colour is easy to get wrong on and hard to find: a chip in
          every tone at once, and the two states of a star. */}
      <Paper variant="outlined" className={styles.page}>
        <Typography variant="subtitle2" component="h3" className={styles.groupName}>
          Every tone at once
        </Typography>
        <Box className={styles.chips}>
          {TONES.map((tone) => (
            <ToneChip key={tone} label={tone} tone={tone} />
          ))}
          {TONES.map((tone) => (
            <ToneChip key={`${tone}-on`} label={tone} tone={tone} selected onClick={() => {}} />
          ))}
        </Box>
        <Box className={styles.chips}>
          <StarRating rating={3.5} average={3.5} subject="this example" />
          <StarRating rating={null} average={2} subject="this example" />
        </Box>
      </Paper>
    </Stack>
  )
}
