import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { RAIL, type RouteDef } from '@navigation/routes.ts'
import styles from './HomePage.module.css'

/* A placeholder standing where a dashboard is going. It is the address the app
   opens at, so it says what the pages are rather than being blank — but it
   holds nothing of its own yet, and nothing should be built on top of it. */
export function HomePage({
  onNavigate,
  patches,
}: {
  onNavigate: (path: string) => void
  /* How many the library holds. The one fact the home page can state today
     without asking the server for anything the app has not already loaded. */
  patches: number
}) {
  const onward: readonly RouteDef[] = RAIL.filter((entry) => entry.name !== 'home')

  return (
    <Box className={styles.page}>
      <Typography component="h2" className={styles.heading}>
        Minimoog Model D
      </Typography>
      <Typography className={styles.line}>
        {patches} {patches === 1 ? 'patch' : 'patches'} in the library. A dashboard goes here.
      </Typography>

      <Box className={styles.onward}>
        {onward.map((entry) => (
          <Box
            key={entry.name}
            component="button"
            type="button"
            className={styles.card}
            onClick={() => onNavigate(entry.path)}
          >
            {entry.title}
          </Box>
        ))}
      </Box>
    </Box>
  )
}
