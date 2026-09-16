import { useEffect, useRef, useState } from 'react'
import styles from './ValueEntry.module.css'

/* An input laid over the knob's cap for typing a value straight in, rather than
   hunting for it by dragging. Opened by double click, which leaves single click
   and drag free to turn the knob.

   Commits on Enter and on blur, abandons on Escape. Text that does not parse is
   abandoned too — the alternative, quietly substituting a default, would look
   like the knob ignored you. */

export interface ValueEntryProps {
  initial: string
  /* Returns null when the text makes no sense, which cancels the edit. */
  parse: (text: string) => number | null
  onCommit: (value: number) => void
  onClose: () => void
}

export function ValueEntry({ initial, parse, onCommit, onClose }: ValueEntryProps) {
  const [text, setText] = useState(initial)
  const input = useRef<HTMLInputElement>(null)
  /* Blur fires as the element unmounts after Enter or Escape; without this the
     commit would run twice, or a cancel would be followed by a commit. */
  const settled = useRef(false)

  useEffect(() => {
    input.current?.focus()
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
    <input
      ref={input}
      className={styles.entry}
      value={text}
      inputMode="decimal"
      aria-label="Type a value"
      onChange={(event) => setText(event.target.value)}
      onBlur={() => settle(true)}
      onKeyDown={(event) => {
        /* Stopped from reaching the knob, which reads arrows and Home/End as
           nudges and would move the value out from under the text being typed. */
        event.stopPropagation()
        if (event.key === 'Enter') settle(true)
        else if (event.key === 'Escape') settle(false)
      }}
      /* The knob starts a drag on pointer down; a press inside the input is not
         one. */
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  )
}
