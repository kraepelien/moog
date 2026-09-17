import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { StarRating } from './StarRating.tsx'
import { ToneChip } from './ToneChip.tsx'
import { BANK_TONES, type Bank } from './entry.ts'
import { instrumentName } from '@instruments/instruments.ts'
import { TONE_COLOURS, tagColour, type TagPalette, type Tone } from '@/tones.ts'
import styles from './PatchHeader.module.css'

export interface HeaderAction {
  readonly label: string
  readonly tone: Tone
  readonly onSelect: () => void
  readonly disabled?: boolean
}

/* Whether what is on the panel has been written down. Green is the whole of the
   feedback a save gives — there is no notification any more — so it has to be
   the resting state of a saved patch rather than a flash that is gone by the
   time anybody looks up. Amber is the other half of the same signal, and both
   are away from the white the rest of the bar is set in. */
const TITLE_TONE: Record<'saved' | 'unsaved', Tone> = {
  saved: 'green',
  unsaved: 'amber',
}

/* What a patch says about itself, in a bar: its name, the chips the library
   filters on, its rating and what can be done to it. The editor prints it above
   the panel so the thing being edited is named on the page it is edited on.

   Takes fields rather than a Patch so the library can draw it for a row it only
   holds a summary of. */
export function PatchHeader({
  name,
  tags,
  instrument,
  bank,
  approximate,
  rating,
  average,
  ratingCount,
  onRate,
  actions,
  unsaved,
  tagPalette = {},
}: {
  name: string
  tags: readonly string[]
  instrument: string | null
  bank: Bank | null
  approximate?: boolean
  rating: number | null
  average: number | null
  ratingCount: number
  /* Absent for a draft the server does not hold yet: there is nothing to hang a
     rating on until it has been saved, so the stars are shown but not offered. */
  onRate?: (stars: number) => void
  actions: readonly HeaderAction[]
  /* Only the editor knows this, and only the editor passes it. Left out, the
     name is drawn in the bar's own ink, which is what a row in a list wants. */
  unsaved?: boolean
  tagPalette?: TagPalette
}) {
  return (
    <Box className={styles.header}>
      <Typography
        component="h2"
        className={styles.title}
        sx={
          unsaved === undefined
            ? undefined
            : { color: TONE_COLOURS[TITLE_TONE[unsaved ? 'unsaved' : 'saved']].ink }
        }
      >
        {name || '(unnamed)'}
      </Typography>

      {/* Synth first, then what it is filed under: the instrument is a fact
          about the patch and the categories are somebody's reading of it. */}
      <Box className={styles.chips}>
        {instrument !== null && <ToneChip label={instrumentName(instrument)} tone="green" />}
        {tags.map((tag) => (
          <ToneChip key={tag} label={tag} tone={tagColour(tagPalette, tag)} />
        ))}
        {bank !== null && <ToneChip label={bank} tone={BANK_TONES[bank]} />}
        {approximate && <ToneChip label="approximate" tone="grey" />}
      </Box>

      <Box className={styles.rating}>
        <StarRating
          rating={rating}
          average={average}
          subject={name || 'this patch'}
          onRate={onRate}
        />
        <Typography component="span" color="text.secondary" className={styles.average}>
          {ratingCount > 0 && `${(average ?? 0).toFixed(1)} (${ratingCount})`}
        </Typography>
      </Box>

      <Box className={styles.actions}>
        {actions.map((action) => (
          <Button
            key={action.label}
            size="small"
            disabled={action.disabled}
            className={styles.action}
            onClick={action.onSelect}
            sx={{
              color: TONE_COLOURS[action.tone].ink,
              backgroundColor: TONE_COLOURS[action.tone].field,
              '&:hover': { backgroundColor: TONE_COLOURS[action.tone].strong },
            }}
          >
            {action.label}
          </Button>
        ))}
      </Box>
    </Box>
  )
}
