import { useCallback, useEffect, useRef } from 'react'
import { readMidi, type MidiEvent } from './midi.ts'

/* Receiving MIDI, as against reading it.
 *
 * Access is asked for on the first key played rather than on load, for the same
 * reason the audio context is opened there: a browser wants a gesture behind
 * the request, and a permission prompt that greets somebody before they have
 * touched anything is a prompt they have no reason to grant. It is asked for
 * once, whatever the answer, and a refusal is not an error here — it means the
 * screen and the typing keyboard are how this instrument gets played.
 *
 * Devices are taken as they come and as they arrive: a keyboard plugged in
 * after the page is open should play it, and does, because the access object
 * says when its ports change.
 */

type MidiLike = {
  readonly inputs: { forEach: (fn: (input: MidiInputLike) => void) => void }
  onstatechange: ((this: unknown, event: unknown) => void) | null
}

type MidiInputLike = {
  onmidimessage: ((event: { data: ArrayLike<number> | null }) => void) | null
}

/* Safari has no Web MIDI at all, and a browser without it fails silently: a
   controller is never heard from. Read in one place so the request and the copy
   explaining its absence cannot disagree. */
export const webMidiSupported = (): boolean =>
  typeof navigator !== 'undefined' &&
  typeof (navigator as Navigator & { requestMIDIAccess?: unknown }).requestMIDIAccess === 'function'

export function useMidi(onEvent: (event: MidiEvent) => void): () => void {
  /* The handler is read through a ref so that attaching to a port does not have
     to happen again every time the component renders with a new closure. Kept
     current in an effect rather than during render, since a render that React
     throws away must not leave a port pointing at it. */
  const latest = useRef(onEvent)
  useEffect(() => {
    latest.current = onEvent
  })
  const asked = useRef(false)
  const access = useRef<MidiLike | null>(null)

  const listen = useCallback((port: MidiInputLike) => {
    port.onmidimessage = (event) => {
      const message = event.data ? readMidi(event.data) : null
      if (message) latest.current(message)
    }
  }, [])

  const connect = useCallback(() => {
    if (asked.current) return
    asked.current = true
    if (!webMidiSupported()) return
    const request = (
      navigator as Navigator & {
        requestMIDIAccess: () => Promise<MidiLike>
      }
    ).requestMIDIAccess
    void request
      .call(navigator)
      .then((granted) => {
        access.current = granted
        granted.inputs.forEach(listen)
        granted.onstatechange = () => granted.inputs.forEach(listen)
      })
      /* Refused, or a browser that offers the call and then declines it. Either
         way there is nothing to report: the instrument is still playable. */
      .catch(() => {})
  }, [listen])

  useEffect(() => {
    return () => {
      const granted = access.current
      if (!granted) return
      granted.onstatechange = null
      granted.inputs.forEach((port) => {
        port.onmidimessage = null
      })
    }
  }, [])

  return connect
}
