import type { ControlDef, ControlType, ControlValue, SectionDef } from './types.ts'

/* Control ids travel in saved patches and exported files, so they are a public
   interface: permissive enough not to dictate a naming convention, strict enough
   that an id is always a safe JSON key. */
const ID_PATTERN = /^[A-Za-z0-9_-]+$/

export interface RegistryInput {
  readonly types: readonly ControlType<never, never>[]
  readonly sections: readonly SectionDef[]
  readonly controls: readonly ControlDef[]
}

export interface Registry {
  readonly sections: readonly SectionDef[]
  readonly controls: readonly ControlDef[]
  readonly controlIds: readonly string[]
  control(id: string): ControlDef | undefined
  controlType(def: ControlDef): ControlType
  controlsInSection(sectionId: string): readonly ControlDef[]
}

/* Throws rather than returning a Result: a malformed registry is a programming
   error that should never reach a running app, and the only callers are module
   initialisation and tests. */
export function createRegistry(input: RegistryInput): Registry {
  const types = new Map<string, ControlType>()
  for (const type of input.types as readonly ControlType[]) {
    if (types.has(type.type)) throw new Error(`Duplicate control type "${type.type}"`)
    types.set(type.type, type)
  }

  const sections = new Map<string, SectionDef>()
  for (const section of input.sections) {
    if (!ID_PATTERN.test(section.id)) throw new Error(`Invalid section id "${section.id}"`)
    if (sections.has(section.id)) throw new Error(`Duplicate section id "${section.id}"`)
    sections.set(section.id, section)
  }

  const controls = new Map<string, ControlDef>()
  const bySection = new Map<string, ControlDef[]>()
  for (const section of input.sections) bySection.set(section.id, [])

  for (const def of input.controls) {
    if (!ID_PATTERN.test(def.id)) throw new Error(`Invalid control id "${def.id}"`)
    if (controls.has(def.id)) throw new Error(`Duplicate control id "${def.id}"`)
    if (!types.has(def.type)) throw new Error(`Control "${def.id}" has unregistered type "${def.type}"`)
    const section = bySection.get(def.section)
    if (!section) throw new Error(`Control "${def.id}" is in unknown section "${def.section}"`)
    controls.set(def.id, def)
    section.push(def)
  }

  return {
    sections: input.sections,
    controls: input.controls,
    controlIds: input.controls.map((d) => d.id),
    control: (id) => controls.get(id),
    controlType: (def) => {
      const type = types.get(def.type)
      if (!type) throw new Error(`Control "${def.id}" has unregistered type "${def.type}"`)
      return type
    },
    controlsInSection: (sectionId) => bySection.get(sectionId) ?? [],
  }
}

export function defaultValues(registry: Registry): Record<string, ControlValue> {
  const values: Record<string, ControlValue> = {}
  for (const def of registry.controls) {
    values[def.id] = registry.controlType(def).defaultValue(def)
  }
  return values
}
