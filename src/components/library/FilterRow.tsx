import { FieldRow } from './FieldRow.tsx'
import { ToneChip } from './ToneChip.tsx'
import type { Tone, ToneColour } from '@/tones.ts'

export interface FilterChoice {
  readonly value: string
  readonly label: string
  readonly tone: Tone | ToneColour
  /* Shown but not switchable — a fact about the patch rather than a choice, like
     the bank a patch came from, which no button here can change. */
  readonly locked?: boolean
}

/* One labelled row of chips, on the same label column as everything else a
   patch says about itself. */
export function FilterRow({
  label,
  choices,
  selected,
  onToggle,
}: {
  label: string
  choices: readonly FilterChoice[]
  selected: readonly string[]
  onToggle: (value: string) => void
}) {
  if (choices.length === 0) return null

  return (
    <FieldRow label={label}>
      {choices.map((choice) => (
        <ToneChip
          key={choice.value}
          label={choice.label}
          tone={choice.tone}
          selected={choice.locked ? undefined : selected.includes(choice.value)}
          onClick={choice.locked ? undefined : () => onToggle(choice.value)}
        />
      ))}
    </FieldRow>
  )
}
