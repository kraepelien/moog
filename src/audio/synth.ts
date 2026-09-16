import { createSynth } from './engine.ts'

/* One instrument, as the app holds one patch store: it owns a browser resource
   that nothing gains by having two of, and the panel above it is one panel.
   Created here rather than in a component so that it survives a re-render, and
   opened on the first key rather than here so that no context is started
   outside a gesture. */
export const synth = createSynth()
