import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import { StarRating } from './StarRating.tsx'
import { ToneChip } from './ToneChip.tsx'
import { bankOf, BANK_TONES, type LibraryEntry, type RowFilter } from './entry.ts'
import { instrumentName } from '@instruments/instruments.ts'
import { tagColour, type TagPalette } from '@/tones.ts'
import styles from './PatchRow.module.css'

/* The whole row is the button, not a Select link inside it: the row is what a
   person aims at, and a target the width of the list cannot be missed on a
   phone. ButtonBase rather than a div with onClick so it is reachable by
   keyboard and announced as a button without any of that being written here. */
export function PatchRow({
  entry,
  open,
  tagPalette = {},
  onOpen,
  onFilter,
  onRate,
}: {
  entry: LibraryEntry
  /* The one the editor is showing. Pressing a row opens it and leaves the list,
     so coming back to a list of forty-four with no idea which one is loaded is
     the state this marks. */
  open?: boolean
  tagPalette?: TagPalette
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

  const bank = bankOf(entry)

  return (
    <ButtonBase
      component="li"
      className={styles.row}
      data-open={open === true ? '' : undefined}
      onClick={onOpen}
      aria-current={open === true ? 'true' : undefined}
      aria-label={
        open === true
          ? `${entry.name || 'This patch'}, open in the editor`
          : `Open ${entry.name || 'this patch'} in the editor`
      }
    >
      <Typography component="span" className={styles.name}>
        {entry.name || '(unnamed)'}
      </Typography>

      <Box className={styles.tags}>
        {entry.tags.map((tag) => (
          <ToneChip
            key={tag}
            label={tag}
            tone={tagColour(tagPalette, tag)}
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

      <Box className={styles.bank}>
        <ToneChip
          label={bank}
          tone={BANK_TONES[bank]}
          {...filtering({ kind: 'bank', value: bank }, bank)}
        />
        {entry.visibility === 'public' && (
          <ToneChip label="public" tone="amber" {...filtering({ kind: 'public' }, 'public')} />
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
