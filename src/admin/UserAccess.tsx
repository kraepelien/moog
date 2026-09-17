import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import {
  ASSIGNABLE_ROLES,
  DESCRIPTION,
  effectiveRoles,
  fromPreset,
  sourceOf,
  PRIVILEGES,
  PRIVILEGE,
  type Privilege,
  type Role,
  type Source,
} from '@access/privileges.ts'
import { displayName, type AdminUser } from './users.ts'
import { TONE_COLOURS, type Tone } from '@/tones.ts'
import styles from './UserAccess.module.css'

/* What one account may do, and why.
 *
 * Three states rather than a checkbox: a privilege is whatever the presets say
 * unless somebody has said otherwise about this account, and "nobody has said"
 * is a different thing from "no". Written as three buttons with aria-pressed
 * because that is how this codebase says on and off — there is no Switch or
 * Checkbox anywhere in it — and because a tri-state checkbox cannot say which
 * of its states is the default one.
 *
 * Every click writes on its own. There is no Save, because one click puts it
 * back, and no whole-set write, because that would delete an override naming a
 * privilege this build has never heard of. */

export type Decision = 'granted' | 'inherited' | 'revoked'

const CHOICES: readonly { decision: Decision; label: string; tone: Tone; ink: string }[] = [
  { decision: 'granted', label: 'Granted', tone: 'green', ink: '#04190c' },
  { decision: 'inherited', label: 'Default', tone: 'grey', ink: '#0e0e11' },
  { decision: 'revoked', label: 'Revoked', tone: 'pink', ink: '#1b0509' },
]

const SAYS: Record<Source, string> = {
  preset: 'from a role',
  granted: 'granted to this account',
  revoked: 'revoked for this account',
  none: 'no role gives this',
}

function decisionOf(source: Source): Decision {
  if (source === 'granted') return 'granted'
  if (source === 'revoked') return 'revoked'
  return 'inherited'
}

function Choice({
  choice,
  on,
  onPress,
  label,
}: {
  choice: (typeof CHOICES)[number]
  on: boolean
  onPress: () => void
  label: string
}) {
  const colour = TONE_COLOURS[choice.tone]
  return (
    <Button
      size="small"
      className={styles.choice}
      aria-label={label}
      aria-pressed={on}
      onClick={onPress}
      sx={{
        color: on ? choice.ink : colour.ink,
        backgroundColor: on ? colour.ink : colour.field,
        '&:hover': { backgroundColor: on ? colour.ink : colour.strong },
      }}
    >
      {choice.label}
    </Button>
  )
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
            This address is listed in <code>MOOG_ADMINS</code>, so it is an administrator whatever
            this page says, and the role cannot be taken away here. Individual privileges can still
            be revoked — except the two that would lock everybody out of this page.
          </Alert>
        )}

        <Box className={styles.roles}>
          <Typography component="span" className={styles.label}>
            Roles
          </Typography>
          {ASSIGNABLE_ROLES.map((role) => {
            const held = user.roles.includes(role)
            const locked = role === 'admin' && user.envAdmin
            const colour = TONE_COLOURS[role === 'admin' ? 'violet' : 'blue']
            return (
              <Button
                key={role}
                size="small"
                className={styles.role}
                aria-label={`${held ? 'Remove' : 'Give'} the ${role} role`}
                aria-pressed={held || locked}
                disabled={locked}
                onClick={() =>
                  onRoles(
                    held ? user.roles.filter((one) => one !== role) : [...user.roles, role],
                  )
                }
                sx={{
                  color: held || locked ? '#0e0e11' : colour.ink,
                  backgroundColor: held || locked ? colour.ink : colour.field,
                  '&:hover': {
                    backgroundColor: held || locked ? colour.ink : colour.strong,
                  },
                }}
              >
                {role}
              </Button>
            )
          })}
          <Typography component="span" color="text.secondary" className={styles.note}>
            Everybody signed in is a member, which is not something to give or take away.
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
            const decision = decisionOf(source)
            /* A grant that says nothing today, and would only start meaning
               something once the role that covers it goes away. */
            const redundant = source === 'granted' && fromPreset(roles, privilege)

            return (
              <Box component="li" key={privilege} className={styles.row}>
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
                  </Typography>
                </Box>

                <Box className={styles.choices}>
                  {CHOICES.map((choice) => (
                    <Choice
                      key={choice.decision}
                      choice={choice}
                      on={decision === choice.decision}
                      label={`${choice.label} ${privilege}`}
                      onPress={() => onDecide(privilege, choice.decision)}
                    />
                  ))}
                </Box>
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
          {PRIVILEGE.AccessAdmin} is the door, not the lock. Taking it away hides the administration
          pages from somebody without taking back what they may do behind them.
        </Alert>
      </Paper>
    </Stack>
  )
}
