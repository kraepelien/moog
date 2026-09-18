import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import { signInHref } from './session.ts'
import styles from './SignIn.module.css'

/* The whole page signed out. The only thing to do here is sign in, so the logo
   is the button rather than sitting above one. */

/* Why the last attempt did not finish. The server redirects here with one of
   these in the query; while the routes lived in the fragment it arrived there
   too, where nothing could read it, so a failed sign-in landed on the editor
   saying nothing at all. */
const TROUBLE: Record<string, string> = {
  expired: 'That took too long. Try again.',
  state: 'That sign-in did not match the one that started. Try again.',
  refused: 'Google did not grant access.',
  exchange: 'Google would not confirm who that was. Try again.',
}

export function SignIn({ returnTo = '/', error }: { returnTo?: string; error?: string | null }) {
  const trouble = error === undefined || error === null ? null : TROUBLE[error] ?? null

  return (
    <main className={styles.page}>
      <ButtonBase
        className={styles.mark}
        href={signInHref(returnTo)}
        aria-label="Sign in with Google"
      >
        <img src="/logo.svg" alt="" width="96" height="96" className={styles.logo} />
      </ButtonBase>
      <Typography className={styles.hint} component="p">
        Sign in with Google
      </Typography>
      {trouble !== null && (
        <Typography className={styles.trouble} component="p" role="alert">
          {trouble}
        </Typography>
      )}
    </main>
  )
}
