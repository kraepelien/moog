import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { printScale } from './printSheet.ts'

/* The panel does not reflow, because the instrument does not, so it is scaled
   to the window instead of scrolled. The wrapper takes the scaled height,
   because a transform does not change the space an element occupies. */
export function FitToWidth({
  children,
  printRoom,
}: {
  children: ReactNode
  /* The box on the paper this has to fit inside. Asked for rather than given as
     a number, because how much of the page is left depends on what else the
     sheet is printing: a patch with three rows of chips and a five-line note
     leaves the panel less room than one with neither, and only the page can
     measure that. Left out, printing takes the screen's scale. */
  printRoom?: () => { readonly width: number; readonly height: number }
}) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState<number | null>(null)
  /* What the window last measured, so printing has something to put back. */
  const onScreen = useRef<{ scale: number; height: number | null }>({ scale: 1, height: null })

  useLayoutEffect(() => {
    const box = outer.current
    const content = inner.current
    if (!box || !content || typeof ResizeObserver === 'undefined') return

    const measure = () => {
      /* Layout width: the rendered width would feed the scale back into itself. */
      const natural = content.offsetWidth
      if (natural === 0) return
      const next = box.clientWidth / natural
      onScreen.current = { scale: next, height: content.offsetHeight * next }
      setScale(next)
      setHeight(content.offsetHeight * next)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(box)
    observer.observe(content)
    measure()
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const box = outer.current
    const content = inner.current
    if (!box || !content || printRoom === undefined) return

    const write = (next: number, tall: number | null) => {
      content.style.transform = `scale(${next})`
      box.style.height = tall === null ? '' : `${tall}px`
    }

    /* Written straight onto the elements, synchronously: the scale on the
       screen is the window's and the paper is not the window, but the snapshot
       print() takes is already made by the time a ResizeObserver callback or a
       React render would have corrected it. */
    const toPaper = () => {
      const natural = content.offsetWidth
      if (natural === 0) return
      const room = printRoom()
      /* Both dimensions, the smaller winning: fitting the width alone put the
         panel on the paper at a height that left the notes box no room, and
         `break-inside: avoid` then moved the whole box onto a second sheet. */
      const next = Math.min(
        printScale(natural, room.width),
        printScale(content.offsetHeight, room.height),
      )
      write(next, content.offsetHeight * next)
    }
    const toScreen = () => write(onScreen.current.scale, onScreen.current.height)

    /* Safari announces a print by changing the media rather than by firing
       beforeprint, so both are listened for; whichever arrives first wins and
       the other writes the same numbers. */
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null
    const announced = (event: MediaQueryListEvent) => (event.matches ? toPaper() : toScreen())

    window.addEventListener('beforeprint', toPaper)
    window.addEventListener('afterprint', toScreen)
    media?.addEventListener('change', announced)
    return () => {
      window.removeEventListener('beforeprint', toPaper)
      window.removeEventListener('afterprint', toScreen)
      media?.removeEventListener('change', announced)
    }
  }, [printRoom])

  return (
    <div ref={outer} style={{ height: height ?? undefined, overflow: 'hidden' }}>
      <div
        ref={inner}
        style={{ width: 'max-content', transform: `scale(${scale})`, transformOrigin: 'top left' }}
      >
        {children}
      </div>
    </div>
  )
}
