import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { webMidiSupported } from '@audio/useMidi.ts'

/* How to play the instrument from something other than this page.
 *
 * It is here rather than only in tools/MIDI.md because somebody meeting the app
 * has no reason to go looking through a repository, and because the one thing
 * that confuses everybody is invisible: the browser is not asked for a MIDI
 * device until the first key is played, so an untouched page looks as though it
 * is ignoring the keyboard plugged into it.
 *
 * Whether the browser can do this at all is read rather than described. It costs
 * nothing, needs no permission, and answers the first question somebody with a
 * silent keyboard actually has.
 */

const ROUTING: readonly (readonly [string, string])[] = [
  ['Keys', 'F1 to C5. Notes outside those are ignored rather than moved into range.'],
  ['Pitch bend', 'The Pitch wheel. Sprung, and never saved in a patch.'],
  ['Modulation wheel', 'The Mod. wheel, which is part of a patch, so moving it marks the draft unsaved.'],
  ['How hard you play', 'Nothing. The instrument has no velocity to give it to.'],
]

export function MidiHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const canDo = webMidiSupported()

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle>Playing this over MIDI</DialogTitle>
      <DialogContent dividers>
        {!canDo && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            This browser does not offer Web MIDI, so none of the below will work here. Chrome, Edge,
            Arc and Brave do; Safari does not.
          </Alert>
        )}

        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>Play one key on screen first.</strong> The browser is not asked for your MIDI
          devices until you do, so until then a connected keyboard looks as though it is being
          ignored. Click a key, or press <code>z</code>, and allow the prompt.
        </Alert>

        <Typography variant="subtitle2" gutterBottom>
          With a keyboard to plug in
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Plug it in at any point, before or after opening this page, then play a key here and allow
          the prompt. That is all of it.
        </Typography>

        <Typography variant="subtitle2" gutterBottom>
          With no hardware at all
        </Typography>
        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          macOS can carry MIDI between two tabs:
          <ol style={{ margin: '6px 0 0', paddingInlineStart: '1.4em' }}>
            <li>
              Open <strong>Audio MIDI Setup</strong>, then Window ▸ Show MIDI Studio.
            </li>
            <li>
              Double-click <strong>IAC Driver</strong> and tick <strong>Device is online</strong>.
            </li>
            <li>Open the sender page in another tab and pick that port.</li>
          </ol>
        </Typography>

        <Typography variant="subtitle2" gutterBottom>
          Where it all goes
        </Typography>
        <Table size="small" sx={{ mb: 1 }}>
          <TableBody>
            {ROUTING.map(([from, to]) => (
              <TableRow key={from}>
                <TableCell sx={{ width: '11rem', verticalAlign: 'top', pl: 0 }}>{from}</TableCell>
                <TableCell sx={{ pr: 0 }}>{to}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* The tools are served by the dev server and are not built into the
            app, so offering them anywhere else would be offering a 404. */}
        {import.meta.env.DEV && (
          <Typography variant="body2" sx={{ mt: 2 }}>
            While developing:{' '}
            <Link href="/tools/midi-send.html" target="_blank" rel="noreferrer">
              the sender
            </Link>
            , which also plays a MIDI file so both hands are free for the panel;{' '}
            <Link href="/tools/midi-check.html" target="_blank" rel="noreferrer">
              the checker
            </Link>
            , which prints what a device is really sending; and{' '}
            <Link href="/tools/MIDI.md" target="_blank" rel="noreferrer">
              the full guide
            </Link>
            .
          </Typography>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          None of this is on the instrument. A Model D has no MIDI socket, predating the standard by
          thirteen years; this is only how the keys get played.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
