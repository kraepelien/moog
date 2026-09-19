import Alert from '@mui/material/Alert'
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
import { ToneChip } from '@components/library/ToneChip.tsx'
import { daysLeft, type PatchRecord } from '@patch/record.ts'
import { tagColour, type TagPalette } from '@/tones.ts'
import styles from './TrashPage.module.css'

/* Deleting has always been a grace period rather than an ending: the row is
   marked and a nightly sweep takes it a month later. Until now nothing could
   reach the middle of that, so the restore route existed and only a hand-made
   request could call it.

   Not a row in the nav. It is opened when something has gone wrong and left
   again, and it is empty for almost everybody almost always, which is the same
   reason preferences hangs off the account menu. What makes it findable is the
   delete confirmation, which says where the patch went. */

function Remaining({ record }: { record: PatchRecord }) {
  const days = daysLeft(record.purgeAt)
  if (days === null) return <span>unknown</span>
  /* Only `bun run serve` sweeps, and only once a day, so a row can sit past its
     own date. A negative number would read as a bug rather than as a queue. */
  if (days <= 0) return <span className={styles.overdue}>due to be removed</span>
  if (days === 1) return <span>gone tomorrow</span>
  return <span>{days} days left</span>
}

export function TrashPage({
  records,
  tagPalette = {},
  onRestore,
}: {
  records: readonly PatchRecord[]
  tagPalette?: TagPalette
  onRestore: (record: PatchRecord) => void
}) {
  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Trash
        </Typography>

        {records.length === 0 ? (
          <Typography color="text.secondary">Nothing you have deleted is waiting here.</Typography>
        ) : (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              A deleted patch is kept for a while before it goes for good. Putting one back returns
              it to your library with its ratings.
            </Alert>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Patch</TableCell>
                    <TableCell>Deleted</TableCell>
                    <TableCell>Left</TableCell>
                    <TableCell align="right">Put back</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className={styles.patch}>
                          <span>{record.name || '(unnamed)'}</span>
                          {record.tags.map((tag) => (
                            <ToneChip key={tag} label={tag} tone={tagColour(tagPalette, tag)} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{(record.deletedAt ?? '').slice(0, 10)}</TableCell>
                      <TableCell>
                        <Remaining record={record} />
                      </TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => onRestore(record)}>
                          Restore
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Paper>
    </Stack>
  )
}
