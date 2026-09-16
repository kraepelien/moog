import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import { StarRating } from './StarRating.tsx'
import { ToneChip } from './ToneChip.tsx'
import type { LibraryEntry } from './entry.ts'
import { instrumentName } from '../../instruments/instruments.ts'
import { toneForTag } from '../../tones.ts'
import styles from './PatchRow.module.css'

/* The whole row is the button, not a Select link inside it: the row is what a
   person aims at, and a target the width of the list cannot be missed on a
   phone. ButtonBase rather than a div with onClick so it is reachable by
   keyboard and announced as a button without any of that being written here. */
export function PatchRow({
  entry,
  index,
  onOpen,
  onRate,
}: {
  entry: LibraryEntry
  /* The library's own numbering, not anything stored: ids are uuids. */
  index: number
  onOpen: () => void
  onRate?: (stars: number) => void
}) {
  return (
    <ButtonBase
      component="li"
      className={styles.row}
      onClick={onOpen}
      aria-label={`Open ${entry.name || 'this patch'} in the editor`}
    >
      <Typography component="span" color="text.secondary" className={styles.index}>
        {String(index + 1).padStart(3, '0')}
      </Typography>

      <Typography component="span" className={styles.name}>
        {entry.name || '(unnamed)'}
      </Typography>

      <Box className={styles.tags}>
        {entry.tags.map((tag) => (
          <ToneChip key={tag} label={tag} tone={toneForTag(tag)} />
        ))}
      </Box>

      <Box className={styles.instrument}>
        <ToneChip label={instrumentName(entry.instrument)} tone="green" />
      </Box>

      <Box className={styles.origin}>
        <ToneChip
          label={entry.origin}
          tone={entry.origin === 'factory' ? 'pink' : 'violet'}
        />
        {entry.visibility === 'public' && <ToneChip label="public" tone="blue" />}
      </Box>

      <Box className={styles.rating}>
        <StarRating
          value={entry.rating}
          label={`Rating for ${entry.name || 'this patch'}`}
          onRate={onRate}
        />
        {entry.ratingCount > 0 && (
          <Typography component="span" color="text.secondary" className={styles.average}>
            {entry.averageRating?.toFixed(1)} ({entry.ratingCount})
          </Typography>
        )}
      </Box>
    </ButtonBase>
  )
}
