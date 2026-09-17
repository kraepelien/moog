import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { MAX_TAG_LENGTH, type TagInUse, tagNameProblem } from './tags.ts'
import { ToneChip } from '../components/library/ToneChip.tsx'
import { toneForTag } from '../tones.ts'

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

export function AdminPage({
  tags,
  onAdd,
  onRemove,
}: {
  tags: readonly TagInUse[]
  onAdd: (name: string) => void
  onRemove: (tag: TagInUse) => void
}) {
  const [typed, setTyped] = useState('')

  const trimmed = typed.trim()
  const duplicate = tags.some((tag) => tag.name.toLowerCase() === trimmed.toLowerCase())
  const problem = trimmed.length === 0 ? null : (tagNameProblem(trimmed) ?? (duplicate ? 'That tag is already on the list.' : null))

  const add = () => {
    if (trimmed.length === 0 || problem !== null) return
    onAdd(trimmed)
    setTyped('')
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Tags
        </Typography>

        <Alert severity="info" sx={{ mb: 2 }}>
          This is the list the save form offers, and nothing else. A patch keeps the tag as plain
          text, so removing one here stops it being given out and leaves every patch already wearing
          it exactly as it is.
        </Alert>

        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault()
            add()
          }}
          sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2 }}
        >
          <TextField
            label="New tag"
            size="small"
            value={typed}
            error={problem !== null}
            helperText={problem ?? ' '}
            slotProps={{ htmlInput: { maxLength: MAX_TAG_LENGTH } }}
            onChange={(event) => setTyped(event.target.value)}
          />
          <Button type="submit" variant="contained" disabled={trimmed.length === 0 || problem !== null} sx={{ mt: 0.5 }}>
            Add
          </Button>
        </Box>

        {tags.length === 0 ? (
          <Typography color="text.secondary">
            No tags. Nothing can be tagged until there is one here.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Tag</TableCell>
                  <TableCell align="right">Patches</TableCell>
                  <TableCell align="right">Remove</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tags.map((tag) => (
                  <TableRow key={tag.id} hover>
                    <TableCell>
                      <ToneChip label={tag.name} tone={toneForTag(tag.name)} />
                    </TableCell>
                    <TableCell align="right">{tag.patches}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        color="error"
                        aria-label={`Remove ${tag.name}`}
                        onClick={() => onRemove(tag)}
                      >
                        <BinGlyph />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Stack>
  )
}
