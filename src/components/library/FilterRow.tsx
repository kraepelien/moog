import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ToneChip } from './ToneChip.tsx'
import type { Tone, ToneColour } from '@/tones.ts'
import styles from './FilterRow.module.css'

export interface FilterChoice {
  readonly value: string
  readonly label: string
  readonly tone: Tone | ToneColour
  /* Shown but not switchable — a fact about the patch rather than a choice, like
     the bank a patch came from, which no button here can change. */
  readonly locked?: boolean
}

/* One labelled row of chips. The label sits in a column of its own width so
   CATEGORY, SYNTH and OTHER line their chips up with each other rather than
   each starting wherever its own word ends. */
export function FilterRow({
  label,
  choices,
  selected,
  onToggle,
}: {
  label: string
  choices: readonly FilterChoice[]
  selected: readonly string[]
  onToggle: (value: string) => void
}) {
  if (choices.length === 0) return null

  return (
    <Stack direction="row" className={styles.row}>
      <Typography component="span" color="text.secondary" className={styles.label}>
        {label}
      </Typography>
      <Stack direction="row" className={styles.chips}>
        {choices.map((choice) => (
          <ToneChip
            key={choice.value}
            label={choice.label}
            tone={choice.tone}
            selected={choice.locked ? undefined : selected.includes(choice.value)}
            onClick={choice.locked ? undefined : () => onToggle(choice.value)}
          />
        ))}
      </Stack>
    </Stack>
  )
}
