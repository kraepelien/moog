import { useState, type ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { ColourField } from './ColourField.tsx'
import { InputAltSpecimen, InputSpecimen, StatusSpecimen } from './Specimens.tsx'
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
  SKIN_SWATCHES,
  TONE_COLOURS,
  TONES,
  type Skin,
  type SkinGroup,
} from '@/tones.ts'
import styles from './LayoutPage.module.css'

/* Where the app's colours are tried out, one surface at a time.
 *
 * There is no preview pane, because for half of these the preview is the page:
 * every field writes straight onto :root, so the bar, the nav, the cards and
 * the text under the cursor all move as the picker moves. A swatch grid beside
 * a miniature of the app would be a second thing to keep in step with the
 * first, and would still be lying about the one surface it could not contain —
 * the one it is drawn on.
 *
 * The other half is not on this page at all. A banner, a text field and the
 * instrument are each somewhere else in the app, and picking a colour for one
 * of them used to mean leaving this page to find out what it did. They get a
 * specimen here instead, which is also the only way to see the three states of
 * a field at once.
 *
 * Eighty-one colours down one page was a list nobody could hold in their head,
 * so they are behind a tab each: what a tab holds is one thing you could point
 * at and name, and its specimen is under it.
 *
 * Nothing here is saved anywhere, and there is no button that would. The paint
 * follows you out of this page and around the app, which is what the banner in
 * the chrome exists to say, and exporting is how a colour becomes the app's.
 */

interface Section {
  readonly name: string
  readonly groups: readonly SkinGroup[]
  /* Why there is no specimen under it, for the sections this page is already
     showing by being repainted. */
  readonly itself?: string
}

const SECTIONS: readonly Section[] = [
  { name: 'Page', groups: ['Page'], itself: 'Behind this card, and every star and filled chip.' },
  {
    name: 'Menu',
    groups: ['Menu'],
    itself: 'The nav beside this page. Point at an item for its hover, and at Layout for the page you are on.',
  },
  { name: 'Header', groups: ['Header'], itself: 'The bar across the top of this page.' },
  { name: 'Content', groups: ['Content'], itself: 'This card, and the rows of the library.' },
  { name: 'Status', groups: ['Status'] },
  { name: 'Input', groups: ['Input'] },
  { name: 'Input alt', groups: ['Input alt'] },
  { name: 'Tones', groups: ['Tones'] },
  { name: 'Instrument', groups: ['Panel', 'Caps', 'Lamps', 'Keys'] },
]

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
  const [open, setOpen] = useState(0)
  const section = SECTIONS[open]!

  const set = (key: string, hex: string) => {
    /* A colour equal to the stylesheet's is an absence rather than a choice, so
       it is dropped: a skin holds only what somebody decided, and a default
       that moves later reaches everyone who never said otherwise. */
    const next = { ...skin }
    if (hex === DEFAULT_SKIN[key]) delete next[key]
    else next[key] = hex
    onSkin(next)
  }

  const specimens: Partial<Record<string, ReactNode>> = {
    Status: <StatusSpecimen />,
    Input: <InputSpecimen />,
    'Input alt': <InputAltSpecimen />,
    Tones: (
      <>
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
      </>
    ),
    /* The real Panel rather than a drawing of one: it is the second thing this
       page would otherwise have to keep in step, and turning a knob is how you
       see a cap against the fascia it sits on. */
    Instrument: (
      <>
        <Typography color="text.secondary" className={styles.aside}>
          Turn something if you want to watch it move; nothing on it is saved as a patch.
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
      </>
    ),
  }
  const specimen = specimens[section.name]

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

        <Tabs
          value={open}
          onChange={(_event, next: number) => setOpen(next)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Which colours to work on"
        >
          {SECTIONS.map((each) => (
            <Tab key={each.name} label={each.name} />
          ))}
        </Tabs>
      </Paper>

      <Paper variant="outlined" className={styles.page}>
        {section.groups.map((group) => (
          <Box key={group} className={styles.group}>
            {section.groups.length > 1 && (
              <Typography variant="subtitle2" component="h3" className={styles.groupName}>
                {group}
              </Typography>
            )}
            <Box className={styles.grid}>
              {SKIN_SWATCHES.filter((swatch) => swatch.group === group).map((swatch) => (
                <ColourField
                  key={swatch.key}
                  label={swatch.label}
                  hint={swatch.pending ? `${swatch.hint}, once applied` : swatch.hint}
                  value={skinValue(skin, swatch.key)}
                  onChange={(hex) => set(swatch.key, hex)}
                />
              ))}
            </Box>
          </Box>
        ))}
      </Paper>

      <Paper variant="outlined" className={styles.page}>
        <Typography variant="subtitle2" component="h3" className={styles.groupName}>
          {section.itself === undefined ? `${section.name}, as it will look` : 'Where to look'}
        </Typography>
        {section.itself === undefined ? (
          specimen
        ) : (
          <Typography color="text.secondary" className={styles.aside}>
            {section.itself}
          </Typography>
        )}
      </Paper>
    </Stack>
  )
}
