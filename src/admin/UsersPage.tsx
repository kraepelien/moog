import { useMemo, useState } from 'react'
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
import { UserAccess, type Decision } from './UserAccess.tsx'
import { displayName, matchesUser, when, type AdminUser } from './users.ts'
import { isAssignable, type Privilege, type Role } from '@access/privileges.ts'
import styles from './UsersPage.module.css'

/* Everyone with an account. Searched in memory like the patch library, because
   the list is small and typing should cost nothing.
 *
 * Picking somebody opens the editor in place rather than on another page: what
 * you are changing is one row of the list you just searched, and losing the
 * search to see it would mean doing it again for the next person. */

export function UsersPage({
  users,
  viewerUid,
  onDecide,
  onRoles,
}: {
  users: readonly AdminUser[]
  /* Passed through rather than read here: the editor draws the two privileges
     nobody may take off their own account, and which account that is is the
     only thing it needs to know about who is looking. */
  viewerUid: string | null
  onDecide: (user: AdminUser, privilege: Privilege, decision: Decision) => void
  onRoles: (user: AdminUser, roles: readonly Role[]) => void
}) {
  const [query, setQuery] = useState('')
  const [openedUid, setOpened] = useState<string | null>(null)

  const shown = useMemo(
    () => users.filter((user) => matchesUser(user, query)),
    [users, query],
  )

  /* Looked up rather than held, so the editor redraws from the list the moment
     a write comes back rather than from a copy taken when it opened. */
  const opened = users.find((user) => user.uid === openedUid) ?? null

  if (opened) {
    return (
      <Stack spacing={2}>
        <Box>
          <Button onClick={() => setOpened(null)}>← Everybody</Button>
        </Box>
        <UserAccess
          user={opened}
          viewerUid={viewerUid}
          onDecide={(privilege, decision) => onDecide(opened, privilege, decision)}
          onRoles={(roles) => onRoles(opened, roles)}
        />
      </Stack>
    )
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          People
        </Typography>

        <Box sx={{ mb: 2 }}>
          <SearchField value={query} onChange={setQuery} placeholder="Search people" />
        </Box>

        {shown.length === 0 ? (
          <Typography color="text.secondary">
            {users.length === 0 ? 'Nobody has signed in yet.' : 'Nobody by that name.'}
          </Typography>
        ) : (
          <TableContainer className={styles.table}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Person</TableCell>
                  <TableCell>Holds</TableCell>
                  <TableCell align="right" className={styles.tally}>
                    Patches
                  </TableCell>
                  <TableCell align="right" className={styles.tally}>
                    Arrangements
                  </TableCell>
                  <TableCell align="right" className={styles.tally}>
                    Ratings
                  </TableCell>
                  <TableCell align="right" className={styles.tally}>
                    Joined
                  </TableCell>
                  <TableCell align="right" className={styles.tally}>
                    Last seen
                  </TableCell>
                  <TableCell align="right">Access</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((user) => (
                  <TableRow key={user.uid} hover>
                    <TableCell>
                      <Box className={styles.person}>
                        <Typography component="span" className={styles.name}>
                          {displayName(user)}
                        </Typography>
                        {user.email !== null && user.email !== displayName(user) && (
                          <Typography
                            component="span"
                            color="text.secondary"
                            className={styles.email}
                          >
                            {user.email}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>

                    {/* The roles as stored, plus what the environment adds.
                        `admin` is never in the column — `formatRoles` keeps it
                        out — so the chip for it comes from `envAdmin` alone
                        rather than from either source that might have it. */}
                    <TableCell>
                      <Box className={styles.holds}>
                        <ToneChip label="member" tone="grey" />
                        {user.roles.filter(isAssignable).map((role) => (
                          <ToneChip key={role} label={role} tone="blue" />
                        ))}
                        {user.envAdmin && <ToneChip label="admin (.env)" tone="violet" />}
                        {user.granted.length > 0 && (
                          <ToneChip
                            label={`+${user.granted.length}`}
                            tone="green"
                            title={`Granted on top of the roles: ${user.granted.join(', ')}`}
                          />
                        )}
                        {user.revoked.length > 0 && (
                          <ToneChip
                            label={`−${user.revoked.length}`}
                            tone="pink"
                            title={`Taken away from this account: ${user.revoked.join(', ')}`}
                          />
                        )}
                      </Box>
                    </TableCell>

                    <TableCell align="right" className={styles.tally}>
                      {user.stats.patches}
                    </TableCell>
                    <TableCell align="right" className={styles.tally}>
                      {user.stats.arrangements}
                    </TableCell>
                    <TableCell align="right" className={styles.tally}>
                      {user.stats.ratings}
                    </TableCell>
                    <TableCell align="right" className={styles.tally} title={user.createdAt}>
                      {when(user.createdAt)}
                    </TableCell>
                    <TableCell align="right" className={styles.tally} title={user.lastSeenAt}>
                      {when(user.lastSeenAt)}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        aria-label={`Change what ${displayName(user)} may do`}
                        onClick={() => setOpened(user.uid)}
                      >
                        Change
                      </Button>
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
