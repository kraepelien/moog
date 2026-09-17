/* A tag as the app sees it. Shared with the server, which is the other end of
   both of these. */
export interface Tag {
  readonly id: number
  readonly name: string
  /* Chosen by an administrator, or null for the hash every surface falls back
     to. One hex: the lettering is it and the chip behind is a wash of it, so
     there is one thing to pick rather than a pair that can disagree. */
  readonly colour: string | null
}

/* The same row plus how many patches wear the name, which only the admin page
   asks for: the count is over everybody's patches, private ones included. */
export interface TagInUse extends Tag {
  readonly patches: number
}

/* Name to colour, for drawing a chip anywhere. Only the tags that have one are
   in it; everything else falls through to the hash. */
export function paletteOf(tags: readonly Tag[]): Readonly<Record<string, string>> {
  const palette: Record<string, string> = {}
  for (const tag of tags) if (tag.colour !== null) palette[tag.name] = tag.colour
  return palette
}

export const MAX_TAG_LENGTH = 32

/* One line so the page and the route agree on what a tag may be called, rather
   than the page allowing something the server then refuses. */
export function tagNameProblem(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'A tag needs a name.'
  if (trimmed.length > MAX_TAG_LENGTH) return `Keep it under ${MAX_TAG_LENGTH} characters.`
  return null
}
