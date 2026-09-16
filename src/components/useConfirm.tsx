import { useCallback, useRef, useState, type ReactElement } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'

/* Asking before something irreversible, without `window.confirm`: that one
   blocks the whole page, cannot be styled or tested, and is silently dropped in
   sandboxed frames — which would turn a declined delete into a delete. */

export interface ConfirmRequest {
  title: string
  body?: string
  /* The word on the button that goes through with it, so a dialog never asks a
     question and answers OK. */
  confirm: string
  destructive?: boolean
}

export function useConfirm(): {
  ask: (request: ConfirmRequest) => Promise<boolean>
  dialog: ReactElement
} {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [open, setOpen] = useState(false)
  const answer = useRef<((agreed: boolean) => void) | null>(null)

  const ask = useCallback(
    (next: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        answer.current = resolve
        setRequest(next)
        setOpen(true)
      }),
    [],
  )

  /* The caller is answered as the dialog starts closing rather than when it has
     finished, so the action does not wait on an animation. The text is kept
     until then so the dialog does not blank out while it fades. */
  const settle = (agreed: boolean) => {
    setOpen(false)
    answer.current?.(agreed)
    answer.current = null
  }

  const dialog = (
    <Dialog
      open={open}
      onClose={() => settle(false)}
      transitionDuration={{ exit: 120 }}
      slotProps={{ transition: { onExited: () => setRequest(null) } }}
    >
      <DialogTitle>{request?.title}</DialogTitle>
      {request?.body && (
        <DialogContent>
          <DialogContentText sx={{ whiteSpace: 'pre-line' }}>{request.body}</DialogContentText>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={() => settle(false)}>Cancel</Button>
        <Button
          onClick={() => settle(true)}
          variant="contained"
          color={request?.destructive ? 'error' : 'primary'}
          autoFocus
        >
          {request?.confirm ?? 'OK'}
        </Button>
      </DialogActions>
    </Dialog>
  )

  return { ask, dialog }
}
