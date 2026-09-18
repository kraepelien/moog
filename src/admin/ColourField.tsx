import { useState } from 'react'
import Box from '@mui/material/Box'
import Slider from '@mui/material/Slider'
import TextField from '@mui/material/TextField'
import { isHexColour } from '@/tones.ts'
import styles from './ColourField.module.css'

/* One colour, picked or typed, with what shows through it.
 *
 * Both ways in, because neither is enough on its own: the swatch is how
 * somebody finds a colour they cannot name, and the box is how they paste the
 * one off a brand sheet. `<input type="color">` is the browser's own picker, a
 * real control on every platform this runs on, and nothing here is worth a
 * dependency that reimplements one.
 *
 * That picker has no alpha channel and accepts only six digits, so opacity is a
 * slider beside it and the two halves are put back together on the way out. The
 * swatch is drawn over a chequerboard at the colour's own opacity, which is the
 * only thing on the row that shows a colour is not solid.
 *
 * The box keeps its own half-typed text. It has to: a hex arrives one character
 * at a time and `#f` is not a colour, so a field that reported every keystroke
 * would repaint the page six times on the way to meaning something — and one
 * that rejected them would be impossible to type into at all. Only a complete
 * hex is reported, and anything else the field is left showing is nothing but
 * letters on the way to being one.
 */

/* Every accepted spelling widened to eight digits, so the rest of this file has
   one shape to handle rather than four. */
function split(hex: string): { rgb: string; alpha: number } {
  const body = hex.slice(1)
  const wide = body.length <= 4 ? [...body].map((digit) => digit + digit).join('') : body
  return {
    rgb: `#${wide.slice(0, 6)}`,
    alpha: wide.length === 8 ? Number.parseInt(wide.slice(6), 16) : 255,
  }
}

/* Six digits whenever it is opaque: the stylesheets are written that way, and a
   trailing `ff` is a difference against the default that nobody asked for and
   the export would then offer to make. */
function join(rgb: string, alpha: number): string {
  return alpha >= 255 ? rgb : `${rgb}${alpha.toString(16).padStart(2, '0')}`
}

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

  const { rgb, alpha } = split(value)

  return (
    <Box className={styles.field}>
      <input
        type="color"
        className={styles.swatch}
        style={{ '--swatch-alpha': alpha / 255 } as React.CSSProperties}
        value={rgb}
        /* Three controls stand for one colour, so each says which part of it it
           holds: the bare label belongs to none of them on its own. */
        aria-label={`${label} as a swatch`}
        onChange={(event) => say(join(event.target.value.toLowerCase(), alpha))}
      />
      <Box className={styles.controls}>
        <TextField
          className={styles.text}
          size="small"
          variant="standard"
          label={label}
          value={typed}
          error={!isHexColour(typed)}
          helperText={hint ?? ' '}
          /* Reported in the one spelling, typed in whichever: `#abc`, `#abcf`
             and `#aabbccff` are one colour, and only the canonical one compares
             equal to the stylesheet's, which is how a field is undone. The box
             is left showing the letters that were typed, because snapping them
             about under the cursor reads as the field arguing. */
          onChange={(event) => {
            const next = event.target.value.trim()
            setTyped(next)
            if (!isHexColour(next)) return
            const { rgb, alpha } = split(next.toLowerCase())
            const canonical = join(rgb, alpha)
            setReported(canonical)
            onChange(canonical)
          }}
          slotProps={{ htmlInput: { 'aria-label': `${label} as a hex code`, maxLength: 9 } }}
        />
        <Slider
          className={styles.alpha}
          size="small"
          min={0}
          max={255}
          value={alpha}
          aria-label={`${label} opacity`}
          /* The number a person thinks in, against the byte the colour is
             written in, so the readout does not report 204 for four fifths. */
          valueLabelDisplay="auto"
          valueLabelFormat={(byte: number) => `${Math.round((byte / 255) * 100)}%`}
          onChange={(_event, next) => say(join(rgb, next as number))}
        />
      </Box>
    </Box>
  )
}
