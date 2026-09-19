import { useMemo } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {
  addedBy,
  DESCRIPTION,
  effectiveRoles,
  isAdministrative,
  isAssignable,
  requiredBy,
  roleGiving,
  sourceOf,
  PRIVILEGES,
  PRIVILEGE,
  ROLE,
  ROLE_LADDER,
  TITLE,
  type Privilege,
  type Role,
} from '@access/privileges.ts'
import {
  decidedBy,
  displayName,
  protectedReason,
  when,
  type AdminUser,
  type Decided,
} from './users.ts'
import { SHELL, TONE_COLOURS } from '@/tones.ts'
import styles from './UserAccess.module.css'

/* What one account may do, and why.
 *
 * Each privilege has one control with three positions, because there are three
 * answers and only three: this account is handed it, this account is refused
 * it, or neither and the roles decide. A revoke is its own position rather than
 * the absence of a grant because it outlives a role being added later, and
 * going back to the roles is a position rather than a button because it is what
 * deleting the row means.
 *
 * The row says what it is in words and keeps the stored name beside it, since
 * that name is what the override row holds and what an error names. The long
 * description sits behind the info icon: whoever is handing a privilege over
 * reads it once, and a list of six paragraphs is a list nobody reads.
 *
 * A revoke the server would refuse is drawn locked — only that position, since
 * granting is never what gets refused. The reasons are `protectedReason`; the
 * floor that keeps somebody holding AdminUsers is not among them and still
 * arrives as an error, because it depends on every other account. */

export type Decision = 'granted' | 'inherited' | 'revoked'

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

function InfoGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path
        d="M12 11v5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="12" cy="7.8" r="1.05" fill="currentColor" />
    </svg>
  )
}

/* Who decided this row and when, which nothing else in the app can say: the
   columns have been written on every override since the schema, and no query
   had ever read them back. The date is a date and the moment is the `title`.

   `verdict` is for a name this build does not know, where the position of a
   control is not there to say which way the row went. */
function Stamp({ decided, verdict = false }: { decided: Decided | undefined; verdict?: boolean }) {
  if (decided === undefined) return null

  return (
    <Box component="span" color="text.secondary" className={styles.stamp} title={decided.at}>
      {verdict ? ` · ${decided.granted ? 'granted' : 'revoked'}` : ''}
      {` · ${when(decided.at)} · ${decidedBy(decided.by)}`}
    </Box>
  )
}

/* Both lines of the tooltip. The stored name is in it rather than only beside
   the title, so the one place somebody reads about a privilege also tells them
   what it is called in an override row and in an error. */
function about(privilege: Privilege) {
  return (
    <>
      <Box component="span" className={styles.tipName}>
        {privilege}
      </Box>
      {DESCRIPTION[privilege]}
    </>
  )
}

/* What each rung adds, with the ones this account already holds marked. Shown
   beside the button that gives the role, because "tester" on its own says
   nothing about what it hands over. */
function RoleCard({
  role,
  held,
  standing,
  user,
  onRoles,
}: {
  role: Role
  held: boolean
  /* Why they hold it, where that is not somebody's decision: everybody is a
     member, and an administrator is one because the environment says so. */
  standing: string | null
  user: AdminUser
  onRoles: (roles: readonly Role[]) => void
}) {
  const adds = addedBy(role)
  const colour = TONE_COLOURS.blue

  return (
    <Box className={styles.roleCard} data-held={held ? 'yes' : 'no'}>
      <Box className={styles.roleHead}>
        <Typography component="span" className={styles.roleName}>
          {role}
        </Typography>
        {isAssignable(role) ? (
          <Button
            size="small"
            className={styles.roleButton}
            aria-label={`${held ? 'Remove' : 'Give'} the ${role} role`}
            aria-pressed={held}
            onClick={() =>
              onRoles(held ? user.roles.filter((one) => one !== role) : [...user.roles, role])
            }
            sx={{
              color: held ? SHELL.onTone : colour.ink,
              backgroundColor: held ? colour.ink : colour.field,
              '&:hover': { backgroundColor: held ? colour.ink : colour.strong },
            }}
          >
            {held ? 'Remove' : 'Give'}
          </Button>
        ) : (
          <Typography component="span" color="text.secondary" className={styles.roleStanding}>
            {standing}
          </Typography>
        )}
      </Box>

      {adds.length === 0 ? (
        <Typography component="span" color="text.secondary" className={styles.roleAdds}>
          Adds nothing on its own.
        </Typography>
      ) : (
        <Box component="ul" className={styles.roleAdds}>
          {adds.map((privilege) => (
            <Box component="li" key={privilege} data-has={user.privileges.includes(privilege) ? 'yes' : 'no'}>
              {TITLE[privilege]}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

function PrivilegeRow({
  privilege,
  user,
  roles,
  viewerUid,
  decided,
  onDecide,
}: {
  privilege: Privilege
  user: AdminUser
  roles: readonly Role[]
  viewerUid: string | null
  /* Undefined where no row is stored, which is the roles answering and nothing
     to stamp. */
  decided: Decided | undefined
  onDecide: (privilege: Privilege, decision: Decision) => void
}) {
  const source = sourceOf(roles, privilege, user)
  const decision: Decision =
    source === 'granted' ? 'granted' : source === 'revoked' ? 'revoked' : 'inherited'

  const held = user.privileges.includes(privilege)
  const giver = roleGiving(roles, privilege)
  const needs = requiredBy(privilege)
  const locked = protectedReason(user, privilege, viewerUid)

  /* Said once, in the order somebody reads it: whether they can do it, then
     what is answering, then the two ways an answer can be true and still do
     nothing. */
  const why =
    decision === 'granted'
      ? 'granted to this account'
      : decision === 'revoked'
        ? 'revoked for this account'
        : giver !== null
          ? `the ${giver} role gives it`
          : 'no role gives it'

  const redundant = decision === 'granted' && giver !== null
  /* Something says yes and the account still cannot do it, because what it is
     conditional on is missing. The confusing row, so it is said out loud. */
  const inert =
    needs !== null && !held && decision !== 'revoked' && (giver !== null || decision === 'granted')
      ? needs
      : null

  const revoke = (
    <ToggleButton
      value="revoked"
      disabled={locked !== null}
      aria-label={`Revoke ${privilege}`}
      className={styles.revoke}
    >
      Revoke
    </ToggleButton>
  )

  return (
    <Box
      component="li"
      className={styles.row}
      data-stored={decision === 'inherited' ? 'no' : 'yes'}
      data-held={held ? 'yes' : 'no'}
      data-locked={locked === null ? 'no' : 'yes'}
    >
      <Box className={styles.about}>
        <Typography component="span" className={styles.title}>
          {TITLE[privilege]}
          <Tooltip title={about(privilege)}>
            <Box
              component="button"
              type="button"
              className={styles.info}
              aria-label={`About ${privilege}`}
            >
              <InfoGlyph />
            </Box>
          </Tooltip>
          {locked !== null && (
            <Tooltip title={locked}>
              <Box component="span" className={styles.lock} aria-hidden="true">
                <LockGlyph />
              </Box>
            </Tooltip>
          )}
        </Typography>
        <Typography component="span" color="text.secondary" className={styles.name}>
          {privilege}
        </Typography>
      </Box>

      <ToggleButtonGroup
        exclusive
        size="small"
        value={decision}
        className={styles.decide}
        aria-label={`What ${privilege} does for this account`}
        /* Null is MUI reporting the selected button pressed again. Passing it
           on would be writing the answer that is already stored. */
        onChange={(_event, next: Decision | null) => next !== null && onDecide(privilege, next)}
      >
        <ToggleButton value="granted" aria-label={`Grant ${privilege}`} className={styles.grant}>
          Grant
        </ToggleButton>
        <ToggleButton value="inherited" aria-label={`Use the roles for ${privilege}`}>
          Default
        </ToggleButton>
        {/* Disabled inside a group takes no pointer events, so the tooltip hangs
            off a wrapper rather than the button. */}
        {locked === null ? revoke : <Tooltip title={locked}><Box component="span">{revoke}</Box></Tooltip>}
      </ToggleButtonGroup>

      <Typography component="span" className={styles.status}>
        <Box component="span" className={styles.verdict}>
          {held ? 'Allowed' : 'Not allowed'}
        </Box>
        <Box component="span" color="text.secondary">
          {' · '}
          {why}
          {locked !== null ? ' · cannot be revoked' : ''}
          {redundant ? ` · the ${giver} role already gives it, so this changes nothing` : ''}
          {inert !== null ? ` · does nothing without ${TITLE[inert]}` : ''}
        </Box>
        <Stamp decided={decided} />
      </Typography>
    </Box>
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

  /* A map rather than a find per row: this draws every privilege there is, and
     a scan inside that loop is a scan per privilege. */
  const stamps = useMemo(
    () => new Map(user.decisions.map((one) => [one.privilege, one])),
    [user.decisions],
  )

  const standing: Partial<Record<Role, string>> = {
    [ROLE.member]: 'everybody signed in',
    [ROLE.admin]: user.envAdmin ? 'from MOOG_ADMINS' : 'not from here',
  }

  const groups: { name: string; note: string; of: readonly Privilege[] }[] = [
    {
      name: 'The instrument',
      note: 'What this account can do with the app itself.',
      of: PRIVILEGES.filter((privilege) => !isAdministrative(privilege)),
    },
    {
      name: 'Administration',
      note: `Every one of these is conditional on ${TITLE[PRIVILEGE.AccessAdmin]}, so taking that away takes back the rest as well as hiding the pages.`,
      of: PRIVILEGES.filter(isAdministrative),
    },
  ]

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2">
          {displayName(user)}
        </Typography>
        <Typography color="text.secondary" className={styles.who}>
          {user.email ?? user.uid} · signed in with {user.provider}
        </Typography>

        <Box className={styles.section}>
          <Typography component="h3" className={styles.label}>
            Roles
          </Typography>
          <Typography component="p" color="text.secondary" className={styles.note}>
            A role holds everything the roles before it hold, so a tester also has what a member
            has. Tester is the only one given from here.
          </Typography>
        </Box>

        <Box className={styles.roles}>
          {ROLE_LADDER.map((role) => (
            <RoleCard
              key={role}
              role={role}
              held={role === ROLE.member || roles.includes(role)}
              standing={standing[role] ?? null}
              user={user}
              onRoles={onRoles}
            />
          ))}
        </Box>

        {user.envAdmin && (
          <Alert severity="info" sx={{ mt: 2 }}>
            This address is listed in <code>MOOG_ADMINS</code>, which is the only thing that makes
            an administrator. Take it out and restart to stop that. The two privileges that would
            lock everybody out of this page are shown locked below.
          </Alert>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2">
          Privileges
        </Typography>
        <Typography color="text.secondary" className={styles.who}>
          Default is whatever the roles above say. Grant and Revoke are stored against this account
          and outlive a role being added or taken away.
        </Typography>

        {groups.map((group) => (
          <Box key={group.name} className={styles.group}>
            <Typography component="h3" className={styles.label}>
              {group.name}
            </Typography>
            <Typography component="p" color="text.secondary" className={styles.note}>
              {group.note}
            </Typography>

            <Box component="ul" className={styles.list}>
              {group.of.map((privilege) => (
                <PrivilegeRow
                  key={privilege}
                  privilege={privilege}
                  user={user}
                  roles={roles}
                  viewerUid={viewerUid}
                  decided={stamps.get(privilege)}
                  onDecide={onDecide}
                />
              ))}
            </Box>
          </Box>
        ))}

        {user.unknown.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            This account also has something said about names this build does not know. Each is left
            exactly as it is and does nothing here.
            {/* With its stamp, which is the whole reason they are shown: an
                override nobody can account for is the one where who wrote it
                is worth knowing. */}
            <Box component="ul" className={styles.unknown}>
              {user.unknown.map((name) => (
                <Box component="li" key={name}>
                  <Box component="span" className={styles.name}>
                    {name}
                  </Box>
                  <Stamp decided={stamps.get(name)} verdict />
                </Box>
              ))}
            </Box>
          </Alert>
        )}
      </Paper>
    </Stack>
  )
}
