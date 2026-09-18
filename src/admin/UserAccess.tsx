import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
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
import { displayName, type AdminUser } from './users.ts'
import { TONE_COLOURS } from '@/tones.ts'
import styles from './UserAccess.module.css'

/* What one account may do, and why.
 *
 * The box says whether they have it; how solid it is says where that came from.
 * Full strength means somebody decided it about this account and there is a row
 * to prove it; faded means nothing was said and a role is answering. Fading the
 * weaker state rather than recolouring it is how the library's filter chips
 * already read, and for the same reason: the two have to be told apart at a
 * glance down a column.
 *
 * Ticking one writes a row saying yes or no. Going back to the roles' answer is
 * deleting that row, which is a separate and much rarer action, so it is a
 * button that only appears once there is something to clear rather than a third
 * thing to aim at every time. */

export type Decision = 'granted' | 'inherited' | 'revoked'

const SAYS: Record<Source, string> = {
  role: 'from a role',
  granted: 'granted to this account',
  revoked: 'revoked for this account',
  none: 'no role gives this',
}

export function UserAccess({
  user,
  onDecide,
  onRoles,
}: {
  user: AdminUser
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
            an administrator. To stop it being one, take the address out and restart. Individual
            privileges can still be revoked here — except the two that would lock everybody out of
            this page, since the environment is how a locked-out install is recovered.
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
                  color: held ? '#0e0e11' : colour.ink,
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

        <Box component="ul" className={styles.list}>
          {PRIVILEGES.map((privilege) => {
            const source = sourceOf(roles, privilege, user)
            const explicit = source === 'granted' || source === 'revoked'

            /* An explicit grant stays ticked even where the account does not end
               up holding it, because the row is real and hiding it would make
               the grant look lost. The line underneath says why it is doing
               nothing. */
            const ticked = source === 'granted' || user.privileges.includes(privilege)

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

            /* Where the answer came from is an attribute rather than a style,
               so the stylesheet fades from it and a test can read it without
               asking what colour anything ended up. */
            return (
              <Box
                component="li"
                key={privilege}
                className={styles.row}
                data-stored={explicit ? 'yes' : 'no'}
              >
                <Checkbox
                  className={styles.check}
                  checked={ticked}
                  slotProps={{ input: { 'aria-label': privilege } }}
                  onChange={(event) =>
                    onDecide(privilege, event.target.checked ? 'granted' : 'revoked')
                  }
                  sx={{
                    color: source === 'revoked' ? TONE_COLOURS.pink.ink : TONE_COLOURS.grey.ink,
                    '&.Mui-checked': { color: TONE_COLOURS.green.ink },
                  }}
                />

                <Box className={styles.about}>
                  <Typography component="span" className={styles.name}>
                    {privilege}
                  </Typography>
                  <Typography component="span" color="text.secondary" className={styles.what}>
                    {DESCRIPTION[privilege]}
                  </Typography>
                  <Typography component="span" color="text.secondary" className={styles.source}>
                    {SAYS[source]}
                    {redundant ? ' — and a role already gives it, so this says nothing yet' : ''}
                    {inert ? ` — but does nothing without ${waiting}` : ''}
                  </Typography>
                </Box>

                {/* Only where there is a row to delete. Going back to the roles'
                    answer is the rare action, so it does not take up a place in
                    every row. */}
                {explicit && (
                  <Button
                    size="small"
                    className={styles.clear}
                    aria-label={`Use the default for ${privilege}`}
                    onClick={() => onDecide(privilege, 'inherited')}
                    sx={{ color: TONE_COLOURS.blue.ink }}
                  >
                    Use default
                  </Button>
                )}
              </Box>
            )
          })}
        </Box>

        {user.unknown.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            This account also has something said about {user.unknown.join(', ')}, which this build
            does not know. It is left exactly as it is and does nothing here.
          </Alert>
        )}

        <Alert severity="info" sx={{ mt: 2 }}>
          A faded tick is a role answering, with nothing stored against this account. Every
          administration privilege is conditional on {PRIVILEGE.AccessAdmin}, so taking that one
          away takes back the rest as well as hiding the pages.
        </Alert>
      </Paper>
    </Stack>
  )
}
