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
import { displayName, matchesUser, type AdminUser } from './users.ts'
import type { Privilege, Role } from '@access/privileges.ts'
import styles from './UsersPage.module.css'

/* Everyone with an account. Searched in memory like the patch library, because
   the list is small and typing should cost nothing.
 *
 * Picking somebody opens the editor in place rather than on another page: what
 * you are changing is one row of the list you just searched, and losing the
 * search to see it would mean doing it again for the next person. */

function when(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '—' : at.toISOString().slice(0, 10)
}

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
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Person</TableCell>
                  <TableCell>Holds</TableCell>
                  <TableCell align="right">Patches</TableCell>
                  <TableCell align="right">Arrangements</TableCell>
                  <TableCell align="right">Ratings</TableCell>
                  <TableCell align="right">Last seen</TableCell>
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

                    <TableCell>
                      <Box className={styles.holds}>
                        {user.envAdmin && <ToneChip label="admin (.env)" tone="violet" />}
                        {user.roles
                          .filter((role) => !(role === 'admin' && user.envAdmin))
                          .map((role) => (
                            <ToneChip key={role} label={role} tone="blue" />
                          ))}
                        {user.granted.length > 0 && (
                          <ToneChip label={`+${user.granted.length}`} tone="green" />
                        )}
                        {user.revoked.length > 0 && (
                          <ToneChip label={`−${user.revoked.length}`} tone="pink" />
                        )}
                      </Box>
                    </TableCell>

                    <TableCell align="right">{user.stats.patches}</TableCell>
                    <TableCell align="right">{user.stats.arrangements}</TableCell>
                    <TableCell align="right">{user.stats.ratings}</TableCell>
                    <TableCell align="right">{when(user.lastSeenAt)}</TableCell>
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
