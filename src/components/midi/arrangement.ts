/* A MIDI file with a sound on each of its parts, as both sides see it.

   A part points at a patch by id rather than carrying a copy of it. Editing a
   patch then changes what the arrangement plays, which is what somebody who
   tweaked a bass and pressed play expects; the cost is that deleting a patch
   leaves a part silent, so the name is kept alongside the id purely so the page
   can say which sound has gone. */

export interface ArrangementPart {
  readonly patchId: string
  /* What it was called when it was chosen, for saying so after it is gone. */
  readonly name: string
}

/* Enough to list them without carrying a file per row. */
export interface ArrangementSummary {
  readonly id: string
  readonly name: string
  readonly fileName: string
  readonly bpm: string
  readonly parts: number
  readonly updatedAt: string
}

export interface Arrangement extends Omit<ArrangementSummary, 'parts'> {
  /* Base64: the API is JSON throughout, and a MIDI file is bytes. */
  readonly midi: string
  readonly parts: Readonly<Record<string, ArrangementPart>>
  readonly soloed: readonly number[]
  readonly muted: readonly number[]
}

/* What a save sends. The id and the timestamp are the server's, exactly as they
   are for a patch. */
export type ArrangementInput = Omit<Arrangement, 'id' | 'updatedAt'>

export const MAX_ARRANGEMENT_NAME = 80

/* One line so the page and the route agree on what an arrangement may be
   called, rather than the page allowing something the server then refuses. */
export function arrangementNameProblem(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Give it a name.'
  if (trimmed.length > MAX_ARRANGEMENT_NAME) {
    return `Keep it under ${MAX_ARRANGEMENT_NAME} characters.`
  }
  return null
}

/* A channel number as a MIDI file can carry one. Keys arrive as strings because
   they came through JSON, so this is what turns one back into a channel. */
export function asChannel(key: string): number | null {
  const channel = Number(key)
  return Number.isInteger(channel) && channel >= 1 && channel <= 16 ? channel : null
}

export function isArrangementPart(value: unknown): value is ArrangementPart {
  if (typeof value !== 'object' || value === null) return false
  const part = value as Partial<ArrangementPart>
  return typeof part.patchId === 'string' && typeof part.name === 'string'
}

/* Checked rather than trusted: this is stored as JSON and read back into the
   page, so a row written by hand must not reach the player as an undefined. */
export function readParts(value: unknown): Record<string, ArrangementPart> {
  if (typeof value !== 'object' || value === null) return {}
  const parts: Record<string, ArrangementPart> = {}
  for (const [key, part] of Object.entries(value)) {
    if (asChannel(key) !== null && isArrangementPart(part)) parts[key] = part
  }
  return parts
}

export function readChannels(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((one): one is number => asChannel(String(one)) !== null))]
}

/* Chunked because `String.fromCharCode(...bytes)` is one argument per byte, and
   a megabyte of them overflows the stack. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let at = 0; at < bytes.length; at += 8192) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 8192))
  }
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at)
  return bytes
}
