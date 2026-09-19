import Typography from '@mui/material/Typography'
import styles from './PatchNotes.module.css'

/* What the patch sheets call the Notes box, and what 35 of the 44 in the bank
   carry: how to play the sound rather than how it is set up. A performance
   instruction wants to be in front of you while the panel is, which is why this
   is drawn where the patch is open and not on a library row.

   It is deliberately not on `LibraryEntry`. Notes are the one field besides
   `values` with no natural size, a row is one line, and a truncated note reads
   worse than no note; the summary stays what a list can draw without fetching
   anything. Writing them is the save form's job, so this only ever reads.

   Here beside `PatchBar` rather than in `patch/` because both are the patch's
   own fields drawn above the panel, which is the reason the header lives in
   this directory too. */
export function PatchNotes({ notes }: { notes: string }) {
  /* An empty box saying Notes is worse than no box: most drafts have none, and
     a heading with nothing under it reads as something that failed to load. */
  if (notes.trim() === '') return null

  return (
    <section className={styles.notes} aria-label="Notes">
      <Typography component="h3" className={styles.heading}>
        Notes
      </Typography>
      <Typography component="p" className={styles.body}>
        {notes}
      </Typography>
    </section>
  )
}
