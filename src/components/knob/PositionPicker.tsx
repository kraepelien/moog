import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import type { DiscretePosition } from '@controls/discrete.ts'

/* A knob with named positions gets a list to pick from rather than a box to type
   in. Typing was the wrong shape for it: there is nothing to say that choosing
   does not say better, and it made the caller guess what "tri" meant.

   The list opens over the dial and starts on the position the knob is already
   in, so the one the knob is set to is the one under the pointer. */

export interface PositionPickerProps {
  anchorEl: Element | null
  positions: readonly DiscretePosition[]
  value: string
  onCommit: (id: string) => void
  onClose: () => void
}

export function PositionPicker({
  anchorEl,
  positions,
  value,
  onCommit,
  onClose,
}: PositionPickerProps) {
  return (
    <Menu
      open={anchorEl !== null}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'center', horizontal: 'center' }}
      transformOrigin={{ vertical: 'center', horizontal: 'center' }}
      slotProps={{ list: { dense: true, 'aria-label': 'Choose a position' } }}
    >
      {positions.map((position) => (
        <MenuItem
          key={position.id}
          selected={position.id === value}
          onClick={() => {
            onCommit(position.id)
            onClose()
          }}
        >
          {position.label}
        </MenuItem>
      ))}
    </Menu>
  )
}
