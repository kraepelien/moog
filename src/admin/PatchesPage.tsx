import { useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { SearchField } from '@components/library/SearchField.tsx'
import { ToneChip } from '@components/library/ToneChip.tsx'
import { BANK_TONES } from '@components/library/entry.ts'
import { instrumentName } from '@instruments/instruments.ts'
import { daysLeft, matchesPatch, type PatchRecord } from '@patch/record.ts'
import { when } from './users.ts'
import { tagColour, type TagPalette } from '@/tones.ts'
import styles from './PatchesPage.module.css'

/* Every patch on the install, which is the one thing `AdminPatches` could
   always do on the server and nothing could reach from the app.

   Editing somebody else's patch is done from here rather than from the library.
   The library is where you go to play something, and a green Save that wrote
   over somebody's work because you happen to hold a privilege is the wrong
   default; coming through this page makes it a deliberate act. */

/* A factory patch is refused to everybody, so its row says so instead of
   drawing three buttons whose only outcome is a 403. */
function Actions({
  record,
  onEdit,
  onUnpublish,
  onDelete,
}: {
  record: PatchRecord
  onEdit: () => void
  onUnpublish: () => void
  onDelete: () => void
}) {
  if (record.deletedAt !== null) return <span className={styles.readOnly}>In the trash</span>

  /* The bank is correctable and nothing more. Editing one fixes a sheet that was
     transcribed wrong; deleting one retires a page of the manual, which is a
     different act and is refused to everybody. */
  if (record.origin === 'factory') {
    return (
      <Box className={styles.actions}>
        <Button size="small" onClick={onEdit}>
          Correct
        </Button>
      </Box>
    )
  }

  return (
    <Box className={styles.actions}>
      <Button size="small" onClick={onEdit}>
        Edit
      </Button>
      {/* Only ever taking a patch out of the public list. There is no Publish:
          putting somebody's private patch in front of everybody is a choice
          they did not make, and the privilege only claims the one direction. */}
      {record.visibility === 'public' && (
        <Button size="small" onClick={onUnpublish}>
          Unpublish
        </Button>
      )}
      <Button size="small" color="error" onClick={onDelete}>
        Delete
      </Button>
    </Box>
  )
}

function Remaining({ record }: { record: PatchRecord }) {
  const days = daysLeft(record.purgeAt)
  if (days === null) return null
  /* Only `bun run serve` sweeps, once a day, so a row can sit past its own
     date. Printing a negative number would read as a bug rather than a queue. */
  if (days <= 0) return <span className={styles.overdue}>due to be removed</span>
  return <span className={styles.deleted}>{days === 1 ? 'gone tomorrow' : `${days} days left`}</span>
}

export function PatchesPage({
  records,
  tagPalette = {},
  onEdit,
  onUnpublish,
  onDelete,
}: {
  records: readonly PatchRecord[]
  tagPalette?: TagPalette
  onEdit: (record: PatchRecord) => void
  onUnpublish: (record: PatchRecord) => void
  onDelete: (record: PatchRecord) => void
}) {
  const [query, setQuery] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)

  const shown = useMemo(
    () =>
      records.filter(
        (record) => matchesPatch(record, query) && (showDeleted ? record.deletedAt !== null : record.deletedAt === null),
      ),
    [records, query, showDeleted],
  )

  const inTrash = records.filter((record) => record.deletedAt !== null).length

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Patches
        </Typography>

        <Alert severity="info" sx={{ mb: 2 }}>
          Every patch on this install, whoever made it. Editing one from here writes back to its
          owner&rsquo;s copy rather than making one of your own, and the editor says whose it is.
          Correcting a patch from the bank changes it for everybody here, which is what the bank
          being seeded rather than synced is for.
        </Alert>

        <Box sx={{ mb: 2 }}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search patches, owners or categories"
          />
        </Box>

        {/* The trash is the same list with the deleted rows instead of the live
            ones, rather than a page of its own: they are the same rows and the
            server already sends both. */}
        <Box sx={{ mb: 2 }}>
          <ToneChip
            label={`In the trash (${inTrash})`}
            tone="grey"
            selected={showDeleted}
            onClick={() => setShowDeleted(!showDeleted)}
          />
        </Box>

        {shown.length === 0 ? (
          <Typography color="text.secondary">
            {showDeleted ? 'Nothing is in the trash.' : 'No patch by that name.'}
          </Typography>
        ) : (
          <TableContainer className={styles.table}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Patch</TableCell>
                  <TableCell>Owner</TableCell>
                  <TableCell>Synth</TableCell>
                  <TableCell>{showDeleted ? 'Deleted' : 'Updated'}</TableCell>
                  <TableCell align="right">{showDeleted ? 'Sweep' : 'Actions'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <Box className={styles.patch}>
                        <span>{record.name || '(unnamed)'}</span>
                        {record.origin === 'factory' && (
                          <ToneChip label="Factory" tone={BANK_TONES.factory} />
                        )}
                        {record.visibility === 'public' && <ToneChip label="Public" tone="amber" />}
                        {record.tags.map((tag) => (
                          <ToneChip key={tag} label={tag} tone={tagColour(tagPalette, tag)} />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell>{record.ownerName ?? (record.origin === 'factory' ? 'The bank' : 'Nobody')}</TableCell>
                    <TableCell>{instrumentName(record.instrument)}</TableCell>
                    <TableCell>{when(record.deletedAt ?? record.updatedAt)}</TableCell>
                    <TableCell align="right">
                      {showDeleted ? (
                        <Remaining record={record} />
                      ) : (
                        <Actions
                          record={record}
                          onEdit={() => onEdit(record)}
                          onUnpublish={() => onUnpublish(record)}
                          onDelete={() => onDelete(record)}
                        />
                      )}
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
