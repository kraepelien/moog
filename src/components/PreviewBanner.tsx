import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { ExportDialog } from '@admin/ExportDialog.tsx'
import { exportPrompt, skinChanges } from '@admin/exportPrompt.ts'
import { TONE_COLOURS, type Skin } from '@/tones.ts'
import styles from './PreviewBanner.module.css'

/* Says that the colours on the screen are not the app's.
 *
 * In the chrome rather than on the layout page, because the preview is the
 * whole app: the colours follow you to the library and the editor, and a page
 * you have walked away from cannot tell you why everything looks different.
 * Without this the repaint has no visible cause and no visible way out.
 */
export function PreviewBanner({ skin, onReset }: { skin: Skin; onReset: () => void }) {
  const [showing, setShowing] = useState(false)
  const changes = skinChanges(skin)
  if (changes.length === 0) return null

  return (
    <Box className={styles.banner}>
      <Typography variant="body2" className={styles.said}>
        <strong>Previewing colours.</strong> Only this browser sees them, and they go when you
        close the tab.
      </Typography>
      <Box className={styles.actions}>
        <Button
          size="small"
          onClick={() => setShowing(true)}
          sx={{ color: TONE_COLOURS.green.ink, backgroundColor: TONE_COLOURS.green.field }}
        >
          Export…
        </Button>
        <Button
          size="small"
          onClick={onReset}
          sx={{ color: TONE_COLOURS.grey.ink, backgroundColor: TONE_COLOURS.grey.field }}
        >
          Reset
        </Button>
      </Box>
      <ExportDialog
        open={showing}
        prompt={exportPrompt(changes)}
        onClose={() => setShowing(false)}
      />
    </Box>
  )
}
