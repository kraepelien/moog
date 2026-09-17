import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { FilterRow, type FilterChoice } from './FilterRow.tsx'
import { BANK_TONES } from './entry.ts'
import { SHELL, TONE_COLOURS, toneForTag } from '../../tones.ts'
import { patchName, type Patch, type Visibility } from '../../patch/schema.ts'
import styles from './SavePatchDialog.module.css'

function ClearGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/* What pressing the button will do to the store. The form cannot work this out
   for itself — only the editor knows whether the server has this draft and
   whether it is mine — but it has to say which one it is, because "save" over
   somebody else's patch and "save" over your own are different acts. */
export type SaveOutcome = 'overwrite' | 'duplicate' | 'new'

const OUTCOMES: Record<SaveOutcome, { action: string; note: (source: string | null) => string }> = {
  overwrite: {
    action: 'Save',
    note: () => 'This writes over the patch you opened.',
  },
  duplicate: {
    action: 'Duplicate',
    note: (source) =>
      source === null
        ? 'This is saved as a patch of your own; what it was copied from is left as it is.'
        : `This is saved as a patch of your own. “${source}” is left as it is.`,
  },
  new: {
    action: 'Save',
    note: () => 'This has not been saved before, so it is saved as a new patch.',
  },
}

/* What the dialog hands back. Not a Patch: it is a form, and what saving a patch
   means — created or written over — belongs to whoever owns the store. */
export interface PatchFields {
  readonly name: string
  readonly notes: string
  readonly tags: readonly string[]
  readonly visibility: Visibility
}

export function SavePatchDialog({
  open,
  patch,
  outcome,
  tagChoices,
  onCancel,
  onSave,
}: {
  open: boolean
  patch: Patch
  outcome: SaveOutcome
  /* The tags already in use, since there is nowhere here to invent one. */
  tagChoices: readonly string[]
  onCancel: () => void
  onSave: (fields: PatchFields) => void
}) {
  const [fields, setFields] = useState<PatchFields>(() => read(patch))
  /* What the fields were last filled from: the patch, while the form is open,
     and nothing once it closes. Comparing against it as this renders is what
     refills the form on every opening — including a second opening of the same
     patch, which has to forget whatever an abandoned first one typed.

     Adjusted here rather than in an effect, which would paint the last edit for
     a frame before replacing it. */
  const [filledFrom, setFilledFrom] = useState<string | null>(null)
  const filling = open ? patch.id : null
  if (filling !== filledFrom) {
    setFilledFrom(filling)
    if (open) setFields(read(patch))
  }

  /* What the patch already wears is offered even when the list no longer does:
     an admin retiring a tag leaves the patches wearing it, and a chip that is
     not drawn is one nobody can take off. */
  const worn = [...new Set([...tagChoices, ...patch.tags])].sort((a, b) => a.localeCompare(b))

  const categories: FilterChoice[] = worn.map((tag) => ({
    value: tag,
    label: tag,
    tone: toneForTag(tag),
  }))

  /* The bank is the server's, so there is no factory chip to press, and you are
     saving into your own name, so the locked one is User and never Custom. What
     is settable here is whether anyone else may see it. */
  const others: FilterChoice[] = [
    { value: 'user', label: 'User', tone: BANK_TONES.user, locked: true },
    { value: 'public', label: 'Public', tone: 'amber' },
  ]

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="md">
      <Box className={styles.dialog}>
        <Box className={styles.header}>
          <Typography component="h2" className={styles.title}>
            Save patch
          </Typography>
          <Box className={styles.actions}>
            <Button
              className={styles.action}
              onClick={() => onSave(fields)}
              sx={{
                color: '#07110b',
                backgroundColor: TONE_COLOURS.green.ink,
                '&:hover': { backgroundColor: TONE_COLOURS.green.ink },
              }}
            >
              {OUTCOMES[outcome].action}
            </Button>
            <Button
              className={styles.action}
              onClick={onCancel}
              sx={{
                color: '#1b0509',
                backgroundColor: TONE_COLOURS.pink.ink,
                '&:hover': { backgroundColor: TONE_COLOURS.pink.ink },
              }}
            >
              Cancel
            </Button>
          </Box>
        </Box>

        <Typography color="text.secondary" className={styles.note}>
          {OUTCOMES[outcome].note(patch.derivedFrom?.name ?? null)}
        </Typography>

        <TextField
          fullWidth
          size="small"
          value={fields.name}
          placeholder="Patch name"
          /* Uppercased as it is typed, not only drawn that way: the field
             showed capitals while handing back whatever was typed. */
          onChange={(event) => setFields({ ...fields, name: patchName(event.target.value) })}
          className={styles.name}
          sx={{ '& .MuiOutlinedInput-root': { backgroundColor: SHELL.field } }}
          slotProps={{
            htmlInput: { 'aria-label': 'Patch name' },
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Clear the name"
                    disabled={fields.name === ''}
                    onClick={() => setFields({ ...fields, name: '' })}
                    sx={{ color: TONE_COLOURS.pink.ink }}
                  >
                    <ClearGlyph />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />

        <Box className={styles.chips}>
          <FilterRow
            label="Category"
            choices={categories}
            selected={fields.tags}
            onToggle={(tag) =>
              setFields({
                ...fields,
                tags: fields.tags.includes(tag)
                  ? fields.tags.filter((held) => held !== tag)
                  : [...fields.tags, tag],
              })
            }
          />
          {/* No synth row: the patch belongs to the editor it was made in, so
              the only instrument this form could offer is the one already
              implied. The draft carries it and saving leaves it alone. */}
          <FilterRow
            label="Other"
            choices={others}
            selected={fields.visibility === 'public' ? ['public'] : []}
            onToggle={() =>
              setFields({
                ...fields,
                visibility: fields.visibility === 'public' ? 'private' : 'public',
              })
            }
          />
        </Box>

        <TextField
          fullWidth
          multiline
          minRows={6}
          value={fields.notes}
          placeholder="Patch notes"
          onChange={(event) => setFields({ ...fields, notes: event.target.value })}
          className={styles.notes}
          sx={{ '& .MuiOutlinedInput-root': { backgroundColor: SHELL.field } }}
          slotProps={{ htmlInput: { 'aria-label': 'Patch notes' } }}
        />
      </Box>
    </Dialog>
  )
}

function read(patch: Patch): PatchFields {
  return {
    name: patch.name,
    notes: patch.notes,
    tags: patch.tags,
    visibility: patch.visibility,
  }
}
