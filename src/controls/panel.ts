import { createRegistry } from './registry.ts'
import type { ControlDef, ControlType, SectionDef } from './types.ts'

/* Deliberately empty. Controls, control types and the panel sections that hold
   them are specified one at a time; nothing is inferred from the hardware. Adding
   a control means adding an entry here plus, for a new type, a codec and a
   component. Nothing else in the app changes. */

export const controlTypes: readonly ControlType<never, never>[] = []

export const sections: readonly SectionDef[] = []

export const controls: readonly ControlDef[] = []

export const panelRegistry = createRegistry({
  types: controlTypes,
  sections,
  controls,
})
