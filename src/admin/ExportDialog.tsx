import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import { TONE_COLOURS } from '@/tones.ts'
import styles from './ExportDialog.module.css'

/* The preview, written out as something to hand somebody.
 *
 * The text is selectable and on the screen before Copy is pressed, which is
 * what makes a clipboard this page is not allowed to write to an inconvenience
 * rather than a dead end.
 */
export function ExportDialog({
  open,
  prompt,
  onClose,
}: {
  open: boolean
  prompt: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [refused, setRefused] = useState(false)
  /* Reset as this renders rather than in an effect, which would show "Copied"
     for a frame the next time the dialog is opened. */
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    setCopied(false)
    setRefused(false)
  }

  const copy = () => {
    void navigator.clipboard
      ?.writeText(prompt)
      .then(() => setCopied(true))
      .catch(() => setRefused(true))
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle>Change the colours the app ships with</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Paste this into a Claude Code session in this repository. It changes the colours in
          source and opens a pull request. Nothing here has been sent anywhere.
        </Typography>

        {refused && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            This browser did not let the page write to the clipboard. Select the text below and
            copy it.
          </Alert>
        )}

        <Box component="pre" className={styles.prompt} aria-label="The prompt" tabIndex={0}>
          {prompt}
        </Box>
      </DialogContent>
      <DialogActions>
        {/* Green and staying green, like a saved patch's name: there is no
            notification surface here, so the button is the whole of the answer
            and has to still be giving it when somebody looks back up. */}
        <Button
          onClick={copy}
          sx={copied ? { color: TONE_COLOURS.green.ink, backgroundColor: TONE_COLOURS.green.field } : undefined}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
