import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { OpsReport } from './ops.ts'
import { when } from './users.ts'
import styles from './OpsPage.module.css'

/* What this server has done to itself since it started: the nightly copy, the
   sweep of the trash, the bank it seeded and the limits it holds people to.
   Every one of those already happened and was visible only in the container's
   log, which meant "did last night's backup work" was a question answered over
   ssh.

   Read-only on purpose. Nothing here is a button: a page that could start a
   backup would be a second way to do what the timer does, and the interesting
   failure is not knowing rather than not being able to run one by hand. */

function Line({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className={styles.line}>
      <Typography component="span" className={styles.name}>
        {name}
      </Typography>
      <Typography component="span" className={styles.value}>
        {children}
      </Typography>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        {title}
      </Typography>
      {children}
    </Paper>
  )
}

/* Bytes as something a person reads. Powers of 1024 with the unit named for
   them, since that is what a file manager on the NAS will say too. */
function size(bytes: number | null): string {
  if (bytes === null) return 'not readable'
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`
}

function moment(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? iso : at.toISOString().replace('T', ' ').slice(0, 16)
}

export function OpsPage({ report }: { report: OpsReport | null }) {
  if (report === null) return <Typography sx={{ p: 2 }}>Loading…</Typography>

  const { backup, purge, factory, limits, limitEnv } = report

  return (
    <Stack spacing={2}>
      <Panel title="Maintenance">
        {report.scheduled ? (
          <Stack>
            {backup === null ? (
              <Line name="Last backup">nothing yet</Line>
            ) : (
              <>
                <Line name="Last backup">
                  <span className={backup.ok ? undefined : styles.failed}>
                    {backup.ok ? moment(backup.at) : `failed at ${moment(backup.at)}`}
                  </span>
                </Line>
                <Line name="Written to">{backup.path}</Line>
                {backup.error !== null && <Line name="What went wrong">{backup.error}</Line>}
              </>
            )}
            {purge !== null && (
              <>
                <Line name="Last trash sweep">{moment(purge.at)}</Line>
                <Line name="Removed">
                  {purge.removed === 0
                    ? 'nothing was old enough'
                    : `${purge.removed} deleted before ${moment(purge.olderThan)}`}
                </Line>
              </>
            )}
            {/* Said out loud because `setInterval` counts from when the process
                started, and an operator expecting a wall-clock hour would be
                wrong about when the next one falls. */}
            <Typography className={styles.since}>
              Every {report.everyHours} hours, counted from when this process started at{' '}
              {moment(report.startedAt)}, not at a fixed hour of the day.
            </Typography>
          </Stack>
        ) : (
          /* A zero here would read as a backup that ran and copied nothing,
             which is a different and much worse thing to believe. */
          <Alert severity="info">
            <AlertTitle>Nothing here takes backups</AlertTitle>
            This process serves the API but runs no timer, which is what{' '}
            <code>bun run dev</code> looks like: the daily copy and the trash sweep belong to{' '}
            <code>bun run serve</code>. What a deployed server has done is on that server's page.
          </Alert>
        )}
      </Panel>

      <Panel title="Factory bank">
        {factory === null ? (
          <Typography color="text.secondary">Not seeded by this process.</Typography>
        ) : factory.refreshed ? (
          <Line name="This start">
            {factory.loaded} patches refreshed from the repo, the one-off, and there is no second
            one
          </Line>
        ) : (
          <>
            <Line name="Written this start">{factory.loaded}</Line>
            <Line name="Already there">{factory.kept}</Line>
            <Line name="Retired">{factory.retired}</Line>
          </>
        )}
      </Panel>

      <Panel title="Database">
        <Line name="File">{report.database.path ?? 'not known to this process'}</Line>
        <Line name="Size">{size(report.database.bytes)}</Line>
        <Line name="Started">{when(report.startedAt)}</Line>
      </Panel>

      <Panel title="Limits">
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          What open registration costs, kept small enough that nobody honest meets it. Each is read
          from its variable at startup, so changing one is a restart.
        </Typography>
        {(Object.keys(limits) as (keyof typeof limits)[]).map((key) => (
          <div key={key} className={styles.line}>
            <Typography component="span" className={styles.name}>
              {limits[key].toLocaleString()}
            </Typography>
            <Typography component="span" className={styles.variable}>
              {limitEnv[key]}
            </Typography>
          </div>
        ))}
      </Panel>
    </Stack>
  )
}
