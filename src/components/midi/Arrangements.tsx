import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  arrangementNameProblem,
  MAX_ARRANGEMENT_NAME,
  type ArrangementSummary,
} from './arrangement.ts'

function BinGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.5 10.5v6M13.5 10.5v6"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* Naming is a dialog rather than a field on the page, because saving is rare
   and the name is the only thing that has to be asked for. Prefilled with what
   the arrangement is already called, so saving again is one keypress. */
export function SaveArrangementDialog({
  open,
  name,
  overwriting,
  onSave,
  onCancel,
}: {
  open: boolean
  name: string
  /* Saving over the one that was opened, rather than adding another. */
  overwriting: boolean
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState(name)

  /* Refilled as it opens rather than in an effect on every render: the name can
     have changed since last time, and an effect would paint the old one first. */
  const [filledFrom, setFilledFrom] = useState(name)
  if (open && filledFrom !== name) {
    setFilledFrom(name)
    setTyped(name)
  }

  const problem = typed.trim().length === 0 ? null : arrangementNameProblem(typed)

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle>{overwriting ? 'Save arrangement' : 'Save a new arrangement'}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label="Name"
          size="small"
          margin="dense"
          value={typed}
          error={problem !== null}
          helperText={problem ?? 'The file and the sound on each part are kept together.'}
          slotProps={{ htmlInput: { maxLength: MAX_ARRANGEMENT_NAME } }}
          onChange={(event) => setTyped(event.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="contained"
          disabled={typed.trim().length === 0 || problem !== null}
          onClick={() => onSave(typed.trim())}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function ArrangementPicker({
  open,
  load,
  onOpen,
  onRemove,
  onCancel,
}: {
  open: boolean
  /* Asked for as the dialog opens rather than held by the page: the list is
     small, it is looked at rarely, and a stale one would offer an arrangement
     that another tab has already deleted. */
  load: () => Promise<readonly ArrangementSummary[]>
  onOpen: (arrangement: ArrangementSummary) => void
  onRemove: (arrangement: ArrangementSummary) => Promise<void>
  onCancel: () => void
}) {
  /* Bumped after a delete, which is the only thing that changes the list while
     it is open. */
  const [asOf, setAsOf] = useState(0)
  const [loaded, setLoaded] = useState<{
    of: string
    rows: readonly ArrangementSummary[]
  } | null>(null)

  /* What the rows were fetched for, compared during render rather than cleared
     as the dialog closes: rows from the last time it was open are stale the
     moment it opens again, and deriving that beats a second render to say so. */
  const asked = `${open}:${asOf}`
  const saved = loaded?.of === asked ? loaded.rows : null

  useEffect(() => {
    if (!open) return
    let current = true
    void load().then((rows) => {
      if (current) setLoaded({ of: asked, rows })
    })
    return () => {
      current = false
    }
  }, [open, load, asked])

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>Saved arrangements</DialogTitle>
      <DialogContent>
        {saved === null && <Typography color="text.secondary">Loading…</Typography>}

        {saved !== null && saved.length === 0 && (
          <Typography color="text.secondary">
            Nothing saved yet. Upload a file, give its parts their sounds, and press Save.
          </Typography>
        )}

        {saved !== null && saved.length > 0 && (
          <List dense>
            {saved.map((arrangement) => (
              <ListItem
                key={arrangement.id}
                disablePadding
                secondaryAction={
                  <IconButton
                    edge="end"
                    size="small"
                    color="error"
                    aria-label={`Delete ${arrangement.name}`}
                    onClick={() => void onRemove(arrangement).then(() => setAsOf((at) => at + 1))}
                  >
                    <BinGlyph />
                  </IconButton>
                }
              >
                <ListItemButton onClick={() => onOpen(arrangement)}>
                  <ListItemText
                    primary={arrangement.name}
                    secondary={
                      <Box component="span">
                        {arrangement.fileName}
                        {' · '}
                        {arrangement.parts === 1 ? '1 part' : `${arrangement.parts} parts`}
                        {arrangement.bpm ? ` · ${arrangement.bpm} bpm` : ''}
                      </Box>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
