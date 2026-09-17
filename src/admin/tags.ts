/* A tag as the admin page sees it: the row, plus how many patches are wearing
   the name. Shared with the server, which is what fills `patches` in. */
export interface TagInUse {
  readonly id: number
  readonly name: string
  readonly patches: number
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
