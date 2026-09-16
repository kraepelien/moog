import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/* The panel does not reflow, because the instrument does not, so it is scaled
   to the window instead of scrolled. The wrapper takes the scaled height,
   because a transform does not change the space an element occupies. */
export function FitToWidth({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const box = outer.current
    const content = inner.current
    if (!box || !content || typeof ResizeObserver === 'undefined') return

    const measure = () => {
      /* Layout width: the rendered width would feed the scale back into itself. */
      const natural = content.offsetWidth
      if (natural === 0) return
      const next = box.clientWidth / natural
      setScale(next)
      setHeight(content.offsetHeight * next)
    }

    const watch = new ResizeObserver(measure)
    watch.observe(box)
    watch.observe(content)
    measure()
    return () => watch.disconnect()
  }, [])

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
