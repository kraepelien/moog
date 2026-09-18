import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ColourField } from './ColourField.tsx'
import { FitToWidth } from '@components/FitToWidth.tsx'
import { Panel } from '@components/Panel.tsx'
import { panelRegistry } from '@controls/panel.ts'
import { defaultValues } from '@controls/registry.ts'
import type { ControlValue } from '@controls/types.ts'
import { StarRating } from '@components/library/StarRating.tsx'
import { ToneChip } from '@components/library/ToneChip.tsx'
import { skinValue } from '@/skin.ts'
import {
  DEFAULT_SKIN,
  SKIN_GROUPS,
  SKIN_SWATCHES,
  TONE_COLOURS,
  TONES,
  type Skin,
} from '@/tones.ts'
import styles from './LayoutPage.module.css'

/* Where the app's colours are tried out.
 *
 * There is no preview pane, because the preview is the page: every field writes
 * straight onto :root, so the bar, the cards, the chips and the text under the
 * cursor all move as the picker moves. A swatch grid beside a miniature of the
 * app would be a second thing to keep in step with the first, and would still
 * be lying about the one surface it could not contain — the one it is drawn on.
 *
 * Nothing here is saved anywhere, and there is no button that would. The paint
 * follows you out of this page and around the app, which is what the banner in
 * the chrome exists to say, and exporting is how a colour becomes the app's.
 */
export function LayoutPage({
  skin,
  keeping,
  onSkin,
}: {
  /* What the fields show, which is also what the document is painted with. */
  skin: Skin
  /* Whether the browser is keeping the preview across a reload. */
  keeping: boolean
  onSkin: (next: Skin) => void
}) {
  /* The panel below is the real component and therefore turnable. Its own
     values, going nowhere: this page chooses colours, not patches. */
  const [demo, setDemo] = useState<Record<string, ControlValue>>(() =>
    defaultValues(panelRegistry),
  )

  const set = (key: string, hex: string) => {
    /* A colour equal to the stylesheet's is an absence rather than a choice, so
       it is dropped: a skin holds only what somebody decided, and a default
       that moves later reaches everyone who never said otherwise. */
    const next = { ...skin }
    if (hex === DEFAULT_SKIN[key]) delete next[key]
    else next[key] = hex
    onSkin(next)
  }

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
              disabled={Object.keys(skin).length === 0}
              onClick={() => onSkin({})}
              sx={{ color: TONE_COLOURS.pink.ink, backgroundColor: TONE_COLOURS.pink.field }}
            >
              Defaults
            </Button>
          </Box>
        </Box>

        <Alert severity="info" className={styles.note}>
          The page repaints as you pick, so what you see is what it will look like, everywhere in
          the app and not only here. The colours are kept on this browser and nobody else sees any
          of them. Exporting is how one becomes a colour the app ships with.
        </Alert>

        {/* The one thing that can go wrong here, and it goes wrong silently:
            the colours are simply not there at the next reload. */}
        {!keeping && (
          <Alert severity="warning" className={styles.note}>
            This browser is not keeping the preview, so it goes as soon as the page reloads. Export
            before you leave.
          </Alert>
        )}

        {SKIN_GROUPS.map((group) => (
          <Box key={group} className={styles.group}>
            <Typography variant="subtitle2" component="h3" className={styles.groupName}>
              {group}
            </Typography>
            <Box className={styles.grid}>
              {SKIN_SWATCHES.filter((swatch) => swatch.group === group).map((swatch) => (
                <ColourField
                  key={swatch.key}
                  label={swatch.label}
                  /* A colour nothing reads yet says so in the one place
                     somebody would otherwise conclude the picker is broken:
                     the page repaints as you drag, except for these. */
                  hint={swatch.pending ? `${swatch.hint}, once applied` : swatch.hint}
                  value={skinValue(skin, swatch.key)}
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

      {/* The instrument is the one thing the page cannot show by being repainted
          itself, because it is not on this page — so the real Panel is, with its
          own throwaway values. A drawing of a panel would be the second thing to
          keep in step that the rest of this page avoids. */}
      <Paper variant="outlined" className={styles.page}>
        <Typography variant="subtitle2" component="h3" className={styles.groupName}>
          The instrument
        </Typography>
        <Typography color="text.secondary" className={styles.aside}>
          Panel, Caps, Lamps and Keys are on show nowhere else here. Turn something
          if you want to watch it move; nothing on it is saved as a patch.
        </Typography>
        <Box className={styles.instrument}>
          <FitToWidth>
            <Panel
              registry={panelRegistry}
              values={demo}
              onChange={(id, value) => setDemo((held) => ({ ...held, [id]: value }))}
            />
          </FitToWidth>
        </Box>
      </Paper>
    </Stack>
  )
}
