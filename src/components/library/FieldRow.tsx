import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import styles from './FieldRow.module.css'

/* One labelled row. The label sits in a column of its own width so CATEGORY,
   SYNTH and RATING line what follows them up with each other rather than each
   starting wherever its own word ends. */
export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack direction="row" className={styles.row}>
      <Typography component="span" color="text.secondary" className={styles.label}>
        {label}
      </Typography>
      <Stack direction="row" className={styles.content}>
        {children}
      </Stack>
    </Stack>
  )
}
