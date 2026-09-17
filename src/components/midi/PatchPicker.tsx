import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import Typography from '@mui/material/Typography'
import { PatchLibrary } from '@components/library/PatchLibrary.tsx'
import type { LibraryEntry } from '@components/library/entry.ts'
import { TONE_COLOURS } from '@/tones.ts'
import styles from './PatchPicker.module.css'

/* The library again, as a way of choosing rather than a way of opening. It is
   the same component: picking a sound for a part is the same act of finding one
   as picking a sound to edit, and a second list with its own search and its own
   filters would drift from this one the first time either changed. */
export function PatchPicker({
  open,
  forPart,
  entries,
  onPick,
  onCancel,
}: {
  open: boolean
  /* Named in the heading, because by the time the library fills the screen it
     is easy to forget which part is being dressed. */
  forPart: string
  entries: readonly LibraryEntry[]
  onPick: (entry: LibraryEntry) => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="lg">
      <Box className={styles.head}>
        <Typography component="h2" className={styles.title}>
          Sound for {forPart}
        </Typography>
        <Button
          className={styles.cancel}
          onClick={onCancel}
          sx={{
            color: TONE_COLOURS.pink.ink,
            backgroundColor: TONE_COLOURS.pink.field,
            '&:hover': { backgroundColor: TONE_COLOURS.pink.strong },
          }}
        >
          Cancel
        </Button>
      </Box>
      <Box className={styles.body}>
        <PatchLibrary entries={entries} onOpen={onPick} />
      </Box>
    </Dialog>
  )
}
