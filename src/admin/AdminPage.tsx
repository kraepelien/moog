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
import { ColourField } from './ColourField.tsx'
import { MAX_TAG_LENGTH, type TagInUse, tagNameProblem } from './tags.ts'
import { ToneChip } from '@components/library/ToneChip.tsx'
import { skinValue } from '@/skin.ts'
import { shadesOf, toneForTag, TONE_COLOURS, type Skin } from '@/tones.ts'
import styles from './AdminPage.module.css'

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
  skin,
  onAdd,
  onColour,
  onRemove,
}: {
  tags: readonly TagInUse[]
  /* What the app is drawing with, so a tag nobody has coloured can show the
     colour it is actually wearing rather than a stand-in. The five tag tones are
     custom properties, and `<input type="color">` needs a value it can parse. */
  skin: Skin
  onAdd: (name: string) => void
  /* Null puts the tag back on the hash, which is the only way to undo a colour:
     a picker has no empty state to pick. */
  onColour: (tag: TagInUse, colour: string | null) => void
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
                  <TableCell>Colour</TableCell>
                  <TableCell align="right" className={styles.tally}>
                    Patches
                  </TableCell>
                  <TableCell align="right">Remove</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tags.map((tag) => {
                  /* A tag nobody has coloured wears the hash's answer, and that
                     is what the picker has to open on: a field showing one
                     colour beside a chip drawn in another reads as the page
                     having lost track of which is which. Clear is what says
                     whether it was chosen — it is disabled until it was. */
                  const worn = tag.colour ?? skinValue(skin, toneForTag(tag.name))
                  return (
                  <TableRow key={tag.id} hover>
                    {/* The chip is the preview: it is the same component every
                        row, filter and patch header draws the tag with, so
                        there is nothing here that could look right while the
                        library looked wrong. */}
                    <TableCell>
                      <ToneChip
                        label={tag.name}
                        tone={tag.colour === null ? toneForTag(tag.name) : shadesOf(tag.colour)}
                      />
                    </TableCell>
                    <TableCell>
                      <Box className={styles.colour}>
                        <ColourField
                          label={`${tag.name} colour`}
                          hint={tag.colour === null ? 'From the name' : undefined}
                          value={worn}
                          onChange={(hex) => onColour(tag, hex)}
                        />
                        <Button
                          size="small"
                          disabled={tag.colour === null}
                          onClick={() => onColour(tag, null)}
                          sx={{ color: TONE_COLOURS.grey.ink }}
                        >
                          Clear
                        </Button>
                      </Box>
                    </TableCell>
                    <TableCell align="right" className={styles.tally}>
                      {tag.patches}
                    </TableCell>
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
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Stack>
  )
}
