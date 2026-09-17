import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { StarRating } from './StarRating.tsx'
import { ToneChip } from './ToneChip.tsx'
import { instrumentName } from '@instruments/instruments.ts'
import { TONE_COLOURS, toneForTag, type Tone } from '@/tones.ts'
import styles from './PatchHeader.module.css'

export interface HeaderAction {
  readonly label: string
  readonly tone: Tone
  readonly onSelect: () => void
  readonly disabled?: boolean
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
  origin,
  approximate,
  rating,
  average,
  ratingCount,
  onRate,
  actions,
}: {
  name: string
  tags: readonly string[]
  instrument: string | null
  origin: 'factory' | 'user' | null
  approximate?: boolean
  rating: number | null
  average: number | null
  ratingCount: number
  /* Absent for a draft the server does not hold yet: there is nothing to hang a
     rating on until it has been saved, so the stars are shown but not offered. */
  onRate?: (stars: number) => void
  actions: readonly HeaderAction[]
}) {
  return (
    <Box className={styles.header}>
      <Typography component="h2" className={styles.title}>
        {name || '(unnamed)'}
      </Typography>

      <Box className={styles.chips}>
        {tags.map((tag) => (
          <ToneChip key={tag} label={tag} tone={toneForTag(tag)} />
        ))}
        {instrument !== null && <ToneChip label={instrumentName(instrument)} tone="green" />}
        {origin !== null && (
          <ToneChip label={origin} tone={origin === 'factory' ? 'pink' : 'violet'} />
        )}
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
