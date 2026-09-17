import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { stopMidi, useMidiSession } from './session.ts'
import { useRoute } from '../../navigation/router.ts'
import { pathFor } from '../../navigation/routes.ts'
import { TONE_COLOURS } from '../../tones.ts'
import styles from './NowPlaying.module.css'

/* A file kept playing after its page was left needs a way back and a way off it
   from wherever you went, or the only stop is finding the tab again. Nothing at
   all on the MIDI page, which has both in front of you. */
export function NowPlaying() {
  const { fileName, playing } = useMidiSession()
  const [{ route }, navigate] = useRoute()

  if (!playing || route.name === 'midi') return null

  return (
    <Box className={styles.strip}>
      <Button
        className={styles.name}
        onClick={() => navigate(pathFor('midi'))}
        sx={{ color: TONE_COLOURS.green.ink }}
      >
        <Box component="span" className={styles.lamp} aria-hidden="true" />
        <Typography component="span" className={styles.label}>
          {fileName || 'Playing'}
        </Typography>
      </Button>

      <Button
        className={styles.stop}
        onClick={stopMidi}
        sx={{
          color: TONE_COLOURS.pink.ink,
          backgroundColor: TONE_COLOURS.pink.field,
          '&:hover': { backgroundColor: TONE_COLOURS.pink.strong },
        }}
      >
        Stop
      </Button>
    </Box>
  )
}
