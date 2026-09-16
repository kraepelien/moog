import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import { signInHref } from './session.ts'
import styles from './SignIn.module.css'

/* The whole page signed out. The only thing to do here is sign in, so the logo
   is the button rather than sitting above one. */
export function SignIn({ returnTo = '/' }: { returnTo?: string }) {
  return (
    <main className={styles.page}>
      <ButtonBase
        className={styles.mark}
        href={signInHref(returnTo)}
        aria-label="Sign in with Google"
      >
        <img src="/logo.png" alt="" width="96" height="96" className={styles.logo} />
      </ButtonBase>
      <Typography className={styles.hint} component="p">
        Sign in with Google
      </Typography>
    </main>
  )
}
