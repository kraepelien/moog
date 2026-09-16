import { useEffect, useRef } from 'react'
import type { DiscretePosition } from '../../controls/discrete.ts'
import styles from './ValueEntry.module.css'

/* A knob with named positions gets a list to pick from rather than a box to type
   in. Typing was the wrong shape for it: there is nothing to say that choosing
   does not say better, and it made the caller guess what "tri" meant.

   A native select rather than a custom list, so the phone gives its own picker
   and keyboard and screen-reader behaviour come for free. */

export interface PositionPickerProps {
  positions: readonly DiscretePosition[]
  value: string
  onCommit: (id: string) => void
  onClose: () => void
}

export function PositionPicker({ positions, value, onCommit, onClose }: PositionPickerProps) {
  const select = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    select.current?.focus()
    /* Opens the list straight away where the browser allows it, so the double
       click that got here is the only gesture needed. Not universally supported,
       and it throws without a user activation, so the focused select is the
       fallback — one more click and it opens by hand. */
    try {
      select.current?.showPicker()
    } catch {
      /* Left focused instead. */
    }
  }, [])

  return (
    <select
      ref={select}
      className={styles.entry}
      value={value}
      aria-label="Choose a position"
      onChange={(event) => {
        onCommit(event.target.value)
        onClose()
      }}
      onBlur={onClose}
      onKeyDown={(event) => {
        /* Kept from the knob beneath, which reads arrows as nudges and would move
           the value while the list is open. */
        event.stopPropagation()
        if (event.key === 'Escape') onClose()
      }}
      /* The knob starts a drag on pointer down; a press on the list is not one. */
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {positions.map((position) => (
        <option key={position.id} value={position.id}>
          {position.label}
        </option>
      ))}
    </select>
  )
}
