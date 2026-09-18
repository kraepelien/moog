import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import styles from './Specimens.module.css'

/* What a group of colours looks like, for the groups the layout page cannot
 * show by being repainted itself.
 *
 * The page is its own preview for the menu, the header, the content and the
 * page behind them: every field writes straight onto :root, so the chrome
 * around this page moves as the picker moves. A drawing of those would be a
 * second thing to keep in step with the first and would still be lying about
 * the surface it was drawn on.
 *
 * A banner and a text field are the other case. Neither is on this page, and
 * finding one means leaving it and losing sight of the picker — so they are
 * here, in every state at once, which is also the only way to see the three
 * states of a field without being in all three at the same time.
 *
 * The properties are written out rather than built from the family's name. A
 * property asked for under a name that no stylesheet declares draws as though
 * the rule were not there, which on a colour is indistinguishable from never
 * having been styled; `test/skin.test.ts` catches that by matching whole names,
 * and half a name assembled at runtime is not something it can check.
 */

interface Face {
  readonly state: string
  readonly bg: string
  readonly border: string
  readonly color: string
}

const INPUT: readonly Face[] = [
  {
    state: 'At rest',
    bg: 'var(--input-bg)',
    border: 'var(--input-border)',
    color: 'var(--input-color)',
  },
  {
    state: 'Under the pointer',
    bg: 'var(--input-hover)',
    border: 'var(--input-hover-border)',
    color: 'var(--input-hover-color)',
  },
  {
    state: 'With the caret in it',
    bg: 'var(--input-active)',
    border: 'var(--input-active-border)',
    color: 'var(--input-active-color)',
  },
]

const INPUT_ALT: readonly Face[] = [
  {
    state: 'At rest',
    bg: 'var(--input-alt-bg)',
    border: 'var(--input-alt-border)',
    color: 'var(--input-alt-color)',
  },
  {
    state: 'Under the pointer',
    bg: 'var(--input-alt-hover)',
    border: 'var(--input-alt-hover-border)',
    color: 'var(--input-alt-hover-color)',
  },
  {
    state: 'With the caret in it',
    bg: 'var(--input-alt-active)',
    border: 'var(--input-alt-active-border)',
    color: 'var(--input-alt-active-color)',
  },
]

const STATUS = [
  {
    name: 'Notification',
    bg: 'var(--notification-bg)',
    border: 'var(--notification-border)',
    color: 'var(--notification-color)',
    alt: 'var(--notification-color-alt)',
    said: 'Forty-four patches came with the app.',
  },
  {
    name: 'Success',
    bg: 'var(--success-bg)',
    border: 'var(--success-border)',
    color: 'var(--success-color)',
    alt: 'var(--success-color-alt)',
    said: 'Saved to the library.',
  },
  {
    name: 'Warning',
    bg: 'var(--warning-bg)',
    border: 'var(--warning-border)',
    color: 'var(--warning-color)',
    alt: 'var(--warning-color-alt)',
    said: 'This patch has unsaved changes.',
  },
  {
    name: 'Error',
    bg: 'var(--error-bg)',
    border: 'var(--error-border)',
    color: 'var(--error-color)',
    alt: 'var(--error-color-alt)',
    said: 'That file is not a patch.',
  },
] as const

export function StatusSpecimen() {
  return (
    <Box className={styles.stack}>
      {STATUS.map((banner) => (
        <Box
          key={banner.name}
          className={styles.banner}
          style={{ backgroundColor: banner.bg, borderColor: banner.border }}
        >
          <Typography className={styles.said} style={{ color: banner.color }}>
            {banner.said}
          </Typography>
          <Typography className={styles.aside} style={{ color: banner.alt }}>
            {banner.name}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

/* Static rather than three real fields: the point is the three states side by
   side, and a field only has one of them at a time. The placeholder row is the
   fourth because it is the one colour that is a state of the text rather than
   of the box around it. */
function Fields({ faces, placeholder }: { faces: readonly Face[]; placeholder: string }) {
  return (
    <Box className={styles.stack}>
      {faces.map((face) => (
        <Box key={face.state} className={styles.fieldRow}>
          <Box
            className={styles.box}
            style={{ backgroundColor: face.bg, borderColor: face.border, color: face.color }}
          >
            Lead, bright
          </Box>
          <Typography className={styles.aside}>{face.state}</Typography>
        </Box>
      ))}
      <Box className={styles.fieldRow}>
        <Box
          className={styles.box}
          style={{
            backgroundColor: faces[0]!.bg,
            borderColor: faces[0]!.border,
            color: placeholder,
          }}
        >
          Name this patch
        </Box>
        <Typography className={styles.aside}>Before anything is typed</Typography>
      </Box>
    </Box>
  )
}

export function InputSpecimen() {
  return <Fields faces={INPUT} placeholder="var(--input-placeholder-color)" />
}

export function InputAltSpecimen() {
  return <Fields faces={INPUT_ALT} placeholder="var(--input-alt-placeholder-color)" />
}
