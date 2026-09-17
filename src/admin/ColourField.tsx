import { useState } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import { isHexColour } from '@/tones.ts'
import styles from './ColourField.module.css'

/* One colour, picked or typed.
 *
 * Both, because neither is enough on its own: the swatch is how somebody finds
 * a colour they cannot name, and the box is how they paste the one off a brand
 * sheet. `<input type="color">` is the browser's own picker, a real control on
 * every platform this runs on, and nothing here is worth a dependency that
 * reimplements one.
 *
 * The box keeps its own half-typed text. It has to: a hex arrives one character
 * at a time and `#f` is not a colour, so a field that reported every keystroke
 * would repaint the page six times on the way to meaning something — and one
 * that rejected them would be impossible to type into at all. Only a complete
 * hex is reported, and anything else the field is left showing is nothing but
 * letters on the way to being one.
 */
export function ColourField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  /* Always a colour: a picker has no empty state, so an unset field shows what
     the app is actually drawing with. */
  value: string
  onChange: (hex: string) => void
}) {
  const [typed, setTyped] = useState(value)
  /* Adjusted as this renders rather than in an effect, which would paint the
     old text for a frame. The comparison is against what the box would have
     reported, so a value that came back from somewhere else — a reset, another
     field — refills it, and one this field itself sent does not. */
  const [reported, setReported] = useState(value)
  if (value !== reported) {
    setReported(value)
    setTyped(value)
  }

  const say = (next: string) => {
    setTyped(next)
    setReported(next)
    onChange(next)
  }

  return (
    <Box className={styles.field}>
      <input
        type="color"
        className={styles.swatch}
        value={value}
        aria-label={label}
        onChange={(event) => say(event.target.value.toLowerCase())}
      />
      <TextField
        className={styles.text}
        size="small"
        variant="standard"
        label={label}
        value={typed}
        error={!isHexColour(typed)}
        helperText={hint ?? ' '}
        onChange={(event) => {
          const next = event.target.value.trim()
          setTyped(next)
          if (isHexColour(next)) say(next.toLowerCase())
        }}
        slotProps={{ htmlInput: { 'aria-label': `${label} as a hex code`, maxLength: 7 } }}
      />
    </Box>
  )
}
