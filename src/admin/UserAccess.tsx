import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {
  ASSIGNABLE_ROLES,
  DESCRIPTION,
  effectiveRoles,
  fromRole,
  requiredBy,
  sourceOf,
  PRIVILEGES,
  PRIVILEGE,
  type Privilege,
  type Role,
  type Source,
} from '@access/privileges.ts'
import { displayName, protectedReason, type AdminUser } from './users.ts'
import { SHELL, TONE_COLOURS } from '@/tones.ts'
import styles from './UserAccess.module.css'

/* What one account may do, and why.
 *
 * Two boxes rather than one, because a privilege that nobody has given and one
 * that somebody took away are not the same state and only the second survives a
 * role being added later. Grant says they have it; how solid it is says whether
 * a row here is what says so, or a role answering. Revoke is its own decision
 * and is stored as one.
 *
 * Between them they draw three states and never a fourth: unticking either box
 * goes back to whatever the roles say, which is deleting the row, so clearing
 * an override needs no button of its own. Unticking a faded grant is the one
 * click that crosses over — there is no row to delete, so wanting it off is a
 * revoke, and the other box ticks to say so.
 *
 * A revoke the server would refuse is drawn locked instead of offered. The
 * reasons are `protectedReason`; the floor that keeps somebody holding
 * AdminUsers is not among them and still arrives as an error, because it
 * depends on every other account. */

export type Decision = 'granted' | 'inherited' | 'revoked'

const SAYS: Record<Source, string> = {
  role: 'from a role',
  granted: 'granted to this account',
  revoked: 'revoked for this account',
  none: 'no role gives this',
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">
      <path
        d="M7 10.5V8a5 5 0 0 1 10 0v2.5M6 10.5h12v9H6z"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function UserAccess({
  user,
  viewerUid,
  onDecide,
  onRoles,
}: {
  user: AdminUser
  /* Who is looking, because two of the refusals are about whether that is the
     same account. Null where nobody is signed in, which is sign-in being off. */
  viewerUid: string | null
  onDecide: (privilege: Privilege, decision: Decision) => void
  onRoles: (roles: readonly Role[]) => void
}) {
  const roles = effectiveRoles(user.roles, user.envAdmin)

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          {displayName(user)}
        </Typography>
        <Typography color="text.secondary" className={styles.who}>
          {user.email ?? user.uid} · signed in with {user.provider}
        </Typography>

        {user.envAdmin && (
          <Alert severity="info" sx={{ mt: 2 }}>
            This address is listed in <code>MOOG_ADMINS</code>, which is the only thing that makes
            an administrator. Take it out and restart to stop that. The two privileges that would
            lock everybody out of this page are shown locked below.
          </Alert>
        )}

        <Box className={styles.roles}>
          <Typography component="span" className={styles.label}>
            Roles
          </Typography>
          {ASSIGNABLE_ROLES.map((role) => {
            const held = user.roles.includes(role)
            const colour = TONE_COLOURS.blue
            return (
              <Button
                key={role}
                size="small"
                className={styles.role}
                aria-label={`${held ? 'Remove' : 'Give'} the ${role} role`}
                aria-pressed={held}
                onClick={() =>
                  onRoles(
                    held ? user.roles.filter((one) => one !== role) : [...user.roles, role],
                  )
                }
                sx={{
                  color: held ? SHELL.onTone : colour.ink,
                  backgroundColor: held ? colour.ink : colour.field,
                  '&:hover': { backgroundColor: held ? colour.ink : colour.strong },
                }}
              >
                {role}
              </Button>
            )
          })}
          {/* The other two are facts rather than decisions, so neither is drawn
              as something to press. */}
          <Typography component="span" color="text.secondary" className={styles.note}>
            Everybody signed in is a member. Being an administrator comes from{' '}
            <code>MOOG_ADMINS</code>, not from here.
          </Typography>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Privileges
        </Typography>

        <Box className={styles.head} aria-hidden="true">
          <Box className={styles.boxes}>
            <Typography component="span" className={styles.label}>
              Grant
            </Typography>
            <Typography component="span" className={styles.label}>
              Revoke
            </Typography>
          </Box>
        </Box>

        <Box component="ul" className={styles.list}>
          {PRIVILEGES.map((privilege) => {
            const source = sourceOf(roles, privilege, user)
            const explicit = source === 'granted' || source === 'revoked'

            /* An explicit grant stays ticked even where the account does not end
               up holding it, because the row is real and hiding it would make
               the grant look lost. The line underneath says why it is doing
               nothing. */
            const granted = source === 'granted' || user.privileges.includes(privilege)
            const revoked = source === 'revoked'

            /* A grant that says nothing today, and would only start meaning
               something once the role that covers it goes away. */
            const redundant = source === 'granted' && fromRole(roles, privilege)
            /* Something gives it and the account still does not have it, because
               what it is conditional on is missing. */
            const waiting = requiredBy(privilege)
            const inert =
              (source === 'granted' || source === 'role') &&
              waiting !== null &&
              !user.privileges.includes(privilege)

            const locked = protectedReason(user, privilege, viewerUid)

            /* Unticking is going back to the roles' answer, which is deleting
               the row. The exception is a tick no row is holding up: there is
               nothing to delete, so wanting it off can only be a revoke. */
            const decideGrant = (wanted: boolean): Decision =>
              wanted ? 'granted' : source === 'granted' ? 'inherited' : 'revoked'

            const boxes = (
              <Box className={styles.boxes}>
                <Checkbox
                  className={styles.grant}
                  checked={granted}
                  disabled={locked !== null}
                  slotProps={{ input: { 'aria-label': `Grant ${privilege}` } }}
                  onChange={(event) => onDecide(privilege, decideGrant(event.target.checked))}
                  sx={{
                    color: TONE_COLOURS.grey.ink,
                    '&.Mui-checked': { color: TONE_COLOURS.green.ink },
                    '&.Mui-disabled.Mui-checked': { color: TONE_COLOURS.green.ink },
                  }}
                />
                <Checkbox
                  className={styles.revoke}
                  checked={revoked}
                  disabled={locked !== null}
                  slotProps={{ input: { 'aria-label': `Revoke ${privilege}` } }}
                  onChange={(event) =>
                    onDecide(privilege, event.target.checked ? 'revoked' : 'inherited')
                  }
                  sx={{
                    color: TONE_COLOURS.grey.ink,
                    '&.Mui-checked': { color: TONE_COLOURS.pink.ink },
                  }}
                />
              </Box>
            )

            /* Where the answer came from is an attribute rather than a style,
               so the stylesheet fades from it and a test can read it without
               asking what colour anything ended up. */
            return (
              <Box
                component="li"
                key={privilege}
                className={styles.row}
                data-stored={explicit ? 'yes' : 'no'}
                data-locked={locked === null ? 'no' : 'yes'}
              >
                {/* The boxes inside are disabled and take no pointer events, so
                    the wrapper is what the tooltip hangs off. */}
                {locked === null ? boxes : <Tooltip title={locked}>{boxes}</Tooltip>}

                <Box className={styles.about}>
                  <Typography component="span" className={styles.name}>
                    {privilege}
                    {locked !== null && (
                      <Tooltip title={locked}>
                        <Box component="span" className={styles.lock} aria-hidden="true">
                          <LockGlyph />
                        </Box>
                      </Tooltip>
                    )}
                  </Typography>
                  <Typography component="span" color="text.secondary" className={styles.what}>
                    {DESCRIPTION[privilege]}
                  </Typography>
                  <Typography component="span" color="text.secondary" className={styles.source}>
                    {SAYS[source]}
                    {locked !== null ? ' — cannot be revoked' : ''}
                    {redundant ? ' — and a role already gives it, so this says nothing yet' : ''}
                    {inert ? ` — but does nothing without ${waiting}` : ''}
                  </Typography>
                </Box>
              </Box>
            )
          })}
        </Box>

        <Typography color="text.secondary" className={styles.legend}>
          A faded tick is a role answering, with nothing stored here; clearing either box goes back
          to that. Revoking is its own box because it outlives a role being added later. Every
          administration privilege is conditional on {PRIVILEGE.AccessAdmin}, so taking that one
          away takes back the rest as well as hiding the pages.
        </Typography>

        {user.unknown.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            This account also has something said about {user.unknown.join(', ')}, which this build
            does not know. It is left exactly as it is and does nothing here.
          </Alert>
        )}
      </Paper>
    </Stack>
  )
}
