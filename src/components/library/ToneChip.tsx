import Chip from '@mui/material/Chip'
import { TONE_COLOURS, type Tone, type ToneColour } from '@/tones.ts'
import styles from './ToneChip.module.css'

/* One chip, in one of the library's tones. Everything the library labels goes
   through this: a tag, an instrument, where a patch came from, whether it is
   published.

   `onClick` is what makes it a filter rather than a label, and MUI gives a
   clickable Chip the button role and keyboard handling for free.

   A filter that is off is faded rather than recoloured: the hue is how you find
   a chip again in a row of twelve, so switching one on brings it up to full
   strength and draws an edge round it instead of changing what colour it is. */
export function ToneChip({
  label,
  tone,
  selected,
  onClick,
  title,
  ariaLabel,
}: {
  label: string
  /* A named tone, or the three shades themselves — which is how a tag wearing
     a colour an administrator chose arrives, there being no custom property for
     a colour nobody declared in advance. */
  tone: Tone | ToneColour
  /* Only meaningful with onClick: a label is neither on nor off. */
  selected?: boolean
  onClick?: (event: React.MouseEvent) => void
  title?: string
  /* What it is called when the visible word is not enough on its own — a tag
     inside a library row reads as the tag, and says what pressing it does. */
  ariaLabel?: string
}) {
  const colour = typeof tone === 'string' ? TONE_COLOURS[tone] : tone
  const on = selected === true

  return (
    <Chip
      label={label}
      size="small"
      title={title}
      aria-label={ariaLabel}
      className={styles.chip}
      onClick={onClick}
      aria-pressed={onClick ? selected === true : undefined}
      sx={{
        color: colour.ink,
        backgroundColor: on ? colour.strong : colour.field,
        boxShadow: on ? `inset 0 0 0 1px ${colour.ink}` : 'none',
        opacity: selected === false ? 0.45 : 1,
        '&:hover': { backgroundColor: colour.strong, opacity: 1 },
      }}
    />
  )
}
