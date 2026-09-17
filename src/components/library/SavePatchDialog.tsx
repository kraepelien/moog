import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { FieldRow } from './FieldRow.tsx'
import { FilterRow, type FilterChoice } from './FilterRow.tsx'
import { StarRating } from './StarRating.tsx'
import { BANK_TONES } from './entry.ts'
import { instrumentName } from '@instruments/instruments.ts'
import { SHELL, TONE_COLOURS, tagColour, type TagPalette } from '@/tones.ts'
import type { Patch, Visibility } from '@patch/schema.ts'
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
  tagPalette = {},
  rating = null,
  average = null,
  ratingCount = 0,
  onCancel,
  onRate,
  onSave,
}: {
  open: boolean
  patch: Patch
  outcome: SaveOutcome
  /* The tags already in use, since there is nowhere here to invent one. */
  tagChoices: readonly string[]
  tagPalette?: TagPalette
  /* Mine, and null when I have not rated it. */
  rating?: number | null
  average?: number | null
  ratingCount?: number
  onCancel: () => void
  /* Absent for a draft the server does not hold yet: there is nothing to hang a
     rating on until it has been saved, so the stars are shown but not offered.
     A rating is given here and not on the panel because this is the one place a
     patch is looked at rather than played. */
  onRate?: (stars: number) => void
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
    tone: tagColour(tagPalette, tag),
  }))

  /* The bank is the server's, so there is no factory chip to press, and you are
     saving into your own name, so the locked one is User and never Custom. What
     is settable here is whether anyone else may see it. */
  const others: FilterChoice[] = [
    { value: 'user', label: 'User', tone: BANK_TONES.user, locked: true },
    { value: 'public', label: 'Public', tone: 'amber' },
  ]

  /* A fact, not a question: the patch belongs to the editor it was made in.
     Locked for the same reason the bank is — a form that draws a fact has to be
     a form that cannot answer it wrongly.

     Nothing here about `approximate`. It is true of the whole factory bank and
     of nothing else, so the bank chip is already carrying it. */
  const synth: FilterChoice[] = [
    { value: 'instrument', label: instrumentName(patch.instrument), tone: 'green', locked: true },
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
          onChange={(event) => setFields({ ...fields, name: event.target.value })}
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
          <FilterRow label="Synth" choices={synth} selected={[]} onToggle={() => {}} />
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

          <FieldRow label="Rating">
            <StarRating
              rating={rating}
              average={average}
              subject={patch.name || 'this patch'}
              onRate={onRate}
            />
            {/* The stars carry one of the two numbers and this carries the
                other, so which is which never depends on remembering a
                colour. */}
            <Typography component="span" color="text.secondary" className={styles.average}>
              {ratingCount > 0 && `${(average ?? 0).toFixed(1)} (${ratingCount})`}
            </Typography>
          </FieldRow>
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
