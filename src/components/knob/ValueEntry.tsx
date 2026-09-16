import { useEffect, useRef, useState } from 'react'
import Popover from '@mui/material/Popover'
import TextField from '@mui/material/TextField'

/* A box for typing a value straight in, rather than hunting for it by dragging.
   Opened by double click, which leaves single click and drag free to turn the
   knob, and floated over the middle of the dial so the eye stays where the
   gesture was.

   Commits on Enter and on dismissal, abandons on Escape. Text that does not
   parse is abandoned too — the alternative, quietly substituting a default,
   would look like the knob ignored you. */

export interface ValueEntryProps<T> {
  /* What the editor floats over: the dial itself, so it lands on the knob that
     was double-clicked rather than in a corner of the screen. */
  anchorEl: Element | null
  initial: string
  /* Returns null when the text makes no sense, which cancels the edit. */
  parse: (text: string) => T | null
  onCommit: (value: T) => void
  onClose: () => void
}

/* Generic in the value, so a step knob can type a position id here just as a
   continuous knob types a number. */
export function ValueEntry<T,>({
  anchorEl,
  initial,
  parse,
  onCommit,
  onClose,
}: ValueEntryProps<T>) {
  const [text, setText] = useState(initial)
  const input = useRef<HTMLInputElement>(null)
  /* Dismissal fires as the element unmounts after Enter or Escape; without this
     the commit would run twice, or a cancel would be followed by a commit. */
  const settled = useRef(false)

  useEffect(() => {
    input.current?.select()
  }, [])

  const settle = (commit: boolean) => {
    if (settled.current) return
    settled.current = true
    if (commit) {
      const parsed = parse(text)
      if (parsed !== null) onCommit(parsed)
    }
    onClose()
  }

  return (
    <Popover
      open={anchorEl !== null}
      anchorEl={anchorEl}
      onClose={() => settle(true)}
      anchorOrigin={{ vertical: 'center', horizontal: 'center' }}
      transformOrigin={{ vertical: 'center', horizontal: 'center' }}
      slotProps={{ paper: { sx: { p: 1 } } }}
    >
      <TextField
        inputRef={input}
        autoFocus
        size="small"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          /* Stopped from reaching the knob, which reads arrows and Home/End as
             nudges and would move the value out from under the text being
             typed. */
          event.stopPropagation()
          if (event.key === 'Enter') settle(true)
          else if (event.key === 'Escape') settle(false)
        }}
        slotProps={{
          htmlInput: {
            'aria-label': 'Type a value',
            inputMode: 'decimal',
            style: { textAlign: 'center', width: '6ch' },
          },
        }}
      />
    </Popover>
  )
}
