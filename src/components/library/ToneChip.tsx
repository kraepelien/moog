import Chip from '@mui/material/Chip'
import { TONE_COLOURS, type Tone } from '../../tones.ts'
import styles from './ToneChip.module.css'

/* One chip, in one of the library's tones. Everything the library labels goes
   through this: a tag, an instrument, where a patch came from, whether it is
   published.

   `onClick` is what makes it a filter rather than a label, and MUI gives a
   clickable Chip the button role and keyboard handling for free.

   A filter that is off keeps its colour, because the colour is how you find the
   chip again — it is switched on by the wash behind it deepening and an edge
   appearing, not by the colour arriving. */
export function ToneChip({
  label,
  tone,
  selected,
  onClick,
  title,
}: {
  label: string
  tone: Tone
  /* Only meaningful with onClick: a label is neither on nor off. */
  selected?: boolean
  onClick?: () => void
  title?: string
}) {
  const colour = TONE_COLOURS[tone]

  return (
    <Chip
      label={label}
      size="small"
      title={title}
      className={styles.chip}
      onClick={onClick}
      aria-pressed={onClick ? selected === true : undefined}
      sx={{
        color: colour.ink,
        backgroundColor: selected ? colour.strong : colour.field,
        boxShadow: selected ? `inset 0 0 0 1px ${colour.ink}` : 'none',
        '&:hover': { backgroundColor: colour.strong },
      }}
    />
  )
}
