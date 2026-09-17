import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import { StarRating } from './StarRating.tsx'
import { ToneChip } from './ToneChip.tsx'
import type { LibraryEntry, RowFilter } from './entry.ts'
import { instrumentName } from '@instruments/instruments.ts'
import { toneForTag } from '@/tones.ts'
import styles from './PatchRow.module.css'

/* The whole row is the button, not a Select link inside it: the row is what a
   person aims at, and a target the width of the list cannot be missed on a
   phone. ButtonBase rather than a div with onClick so it is reachable by
   keyboard and announced as a button without any of that being written here. */
export function PatchRow({
  entry,
  onOpen,
  onFilter,
  onRate,
}: {
  entry: LibraryEntry
  onOpen: () => void
  /* Every chip on a row is one the filter rows also draw, so pressing one does
     what pressing it up there does: it narrows the list. Without this the only
     way to act on a chip you can see is to find it again among the filters. */
  onFilter?: (pressed: RowFilter) => void
  onRate?: (stars: number) => void
}) {
  /* The row underneath is a button too, so a press meant for a chip has to stop
     before it opens the patch. The chip reads as its own word, which says
     nothing about what pressing it does, so it is named here as well. */
  const filtering = (pressed: RowFilter, what: string) =>
    onFilter === undefined
      ? {}
      : {
          ariaLabel: `Show only ${what} patches`,
          onClick: (event: React.MouseEvent) => {
            event.stopPropagation()
            onFilter(pressed)
          },
        }

  return (
    <ButtonBase
      component="li"
      className={styles.row}
      onClick={onOpen}
      aria-label={`Open ${entry.name || 'this patch'} in the editor`}
    >
      <Typography component="span" className={styles.name}>
        {entry.name || '(unnamed)'}
      </Typography>

      <Box className={styles.tags}>
        {entry.tags.map((tag) => (
          <ToneChip
            key={tag}
            label={tag}
            tone={toneForTag(tag)}
            {...filtering({ kind: 'tag', value: tag }, tag)}
          />
        ))}
      </Box>

      <Box className={styles.instrument}>
        <ToneChip
          label={instrumentName(entry.instrument)}
          tone="green"
          {...filtering(
            { kind: 'instrument', value: entry.instrument },
            instrumentName(entry.instrument),
          )}
        />
      </Box>

      <Box className={styles.origin}>
        <ToneChip
          label={entry.origin}
          tone={entry.origin === 'factory' ? 'pink' : 'violet'}
          {...filtering({ kind: 'origin', value: entry.origin }, entry.origin)}
        />
        {entry.visibility === 'public' && (
          <ToneChip label="public" tone="blue" {...filtering({ kind: 'public' }, 'public')} />
        )}
      </Box>

      <Box className={styles.rating}>
        <StarRating
          rating={entry.rating}
          average={entry.averageRating}
          subject={entry.name || 'this patch'}
          onRate={onRate}
        />
        <Typography component="span" color="text.secondary" className={styles.average}>
          {entry.ratingCount > 0 &&
            `${(entry.averageRating ?? 0).toFixed(1)} (${entry.ratingCount})`}
        </Typography>
      </Box>
    </ButtonBase>
  )
}
